/** `[77390] 완구/취미>스포츠/야외완구>물총`를 분해한 결과. */
export interface CoupangCategoryCell {
  raw: string;
  code: number;
  path: string;
  leaf: string;
}

export interface CategoryCorpusEntry {
  displayName: string;
  registeredName?: string | null;
  categoryCell: string;
}

export type CategoryConfidence = 'high' | 'medium' | 'low';

export interface CategoryInference {
  cell: CoupangCategoryCell;
  score: number;
  confidence: CategoryConfidence;
  basedOn: string[];
  support: number;
}

const CELL_PATTERN = /^\s*\[(\d+)\]\s*(.+?)\s*$/;

export function parseCoupangCategoryCell(raw: string): CoupangCategoryCell | null {
  if (typeof raw !== 'string') return null;
  const match = CELL_PATTERN.exec(raw);
  if (!match) return null;

  const code = Number.parseInt(match[1], 10);
  if (!Number.isFinite(code) || code <= 0) return null;

  const path = match[2].trim();
  if (!path || !path.includes('>')) return null;

  const segments = path.split('>').map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  return {
    raw: raw.trim(),
    code,
    path: segments.join('>'),
    leaf: segments[segments.length - 1],
  };
}

const STOP_TOKENS = new Set([
  '상세페이지',
  '참조',
  '랜덤',
  '랜덤발송',
  '혼합',
  '혼합색상',
  '쿠팡용',
  '단품',
  '세트',
  '증정',
  '무료배송',
]);

const QUANTITY_TOKEN =
  /^\d+(?:개입|개월|개|입|매|장|종|셋트|세트|p|pcs|g|kg|ml|l|cm|mm|호)?$/;

const LEADING_CATALOG_PRICE = /^(\d{3,6})\s*(?=[a-z가-힣])/i;

/**
 * 쿠팡 등록상품명의 선행 소비자가(예: `3500꿀사과슬랑이`)와 공백/기호를
 * 제거해 동일 상품 여부만 비교할 수 있는 키를 만든다.
 */
export function normalizeCatalogProductIdentity(value: string): string {
  const normalized = (value ?? '').normalize('NFKC').toLowerCase().trim();
  const priceMatch = LEADING_CATALOG_PRICE.exec(normalized);
  const withoutCatalogPrice =
    priceMatch
    && Number(priceMatch[1]) >= 500
    && Number(priceMatch[1]) % 100 === 0
      ? normalized.slice(priceMatch[0].length)
      : normalized;

  return withoutCatalogPrice.replace(/[^0-9a-z가-힣]+/g, '');
}

export function tokenizeProductName(value: string): Set<string> {
  const normalized = (value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[[\](){}]/g, ' ');

  return new Set(
    normalized
      .split(/[^0-9a-z가-힣]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .filter((token) => !QUANTITY_TOKEN.test(token))
      .filter((token) => !STOP_TOKENS.has(token)),
  );
}

function bigrams(value: string): Set<string> {
  const compact = value.replace(/\s+/g, '');
  const result = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) {
    result.add(compact.slice(index, index + 2));
  }
  return result;
}

function sharedCount(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const item of left) if (right.has(item)) count += 1;
  return count;
}

function diceCoefficient(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  return (2 * sharedCount(left, right)) / (left.size + right.size);
}

function overlapCoefficient(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  return sharedCount(left, right) / Math.min(left.size, right.size);
}

export function scoreNameSimilarity(left: string, right: string): number {
  const tokenScore = diceCoefficient(tokenizeProductName(left), tokenizeProductName(right));
  const gramScore = overlapCoefficient(bigrams(left.toLowerCase()), bigrams(right.toLowerCase()));
  return Math.max(tokenScore, gramScore * 0.85);
}

export interface InferCategoryOptions {
  minScore?: number;
  evidenceLimit?: number;
}

const MEDIUM_SCORE = 0.32;
const NEIGHBOUR_COUNT = 10;
const MEDIUM_CONSENSUS = 0.45;

/**
 * 유사도 경로에서 `high` 로 올라가는 기준.
 *
 * 예전에는 `high` 가 identity match(이미 등록된 동일/접두 상품명)에서만 나왔다.
 * 그런데 웹은 `high` 만 자동적용하므로, **신규 소싱 상품은 구조적으로 절대 카테고리가
 * 채워지지 않았다** — high 가 나오려면 이미 등록된 상품이어야 했기 때문이다.
 * 카테고리가 비면 WING 폼에서 옵션 영역 자체가 렌더되지 않아 등록이 통째로 막힌다.
 *
 * 실제 코퍼스(1145건) 실측 기준으로 잡은 값이다.
 *   - "어린이 물놀이 워터건 대용량 물총" → 0.615 / 합의 높음 → 물총 (정답)
 *   - "초등학생 캐릭터 필통 대용량 문구세트" → 0.364 → 문구세트 (정답)
 *   - "아동용 캐릭터 LED 야광 팔찌" → 0.372 / 합의 낮음 → 캐치볼 (오답)
 * 점수만으로는 정답과 오답이 갈리지 않아 **이웃 합의율을 함께 요구**한다.
 */
const HIGH_SCORE = 0.5;
const HIGH_CONSENSUS = 0.55;

interface ParsedCategoryCorpusEntry {
  cell: CoupangCategoryCell;
  names: string[];
}

interface IdentityMatch {
  cell: CoupangCategoryCell;
  name: string;
  exact: boolean;
}

function uniqueNames(entry: CategoryCorpusEntry): string[] {
  return [
    ...new Set(
      [entry.registeredName, entry.displayName]
        .filter((name): name is string => typeof name === 'string' && Boolean(name.trim()))
        .map((name) => name.trim()),
    ),
  ];
}

function findIdentityMatches(
  productName: string,
  corpus: ParsedCategoryCorpusEntry[],
): IdentityMatch[] {
  const target = normalizeCatalogProductIdentity(productName);
  if (target.length < 4) return [];

  return corpus.flatMap((entry) =>
    entry.names.flatMap((name) => {
      const candidate = normalizeCatalogProductIdentity(name);
      if (candidate.length < 4) return [];
      const exact = candidate === target;
      const prefix = candidate.startsWith(target) || target.startsWith(candidate);
      return exact || prefix ? [{ cell: entry.cell, name, exact }] : [];
    }));
}

export function inferCoupangCategory(
  productName: string,
  corpus: CategoryCorpusEntry[],
  options: InferCategoryOptions = {},
): CategoryInference | null {
  const minScore = options.minScore ?? 0.2;
  const evidenceLimit = options.evidenceLimit ?? 3;
  if (!productName?.trim() || !Array.isArray(corpus) || corpus.length === 0) return null;

  const parsedCorpus: ParsedCategoryCorpusEntry[] = [];
  const supportByCell = new Map<string, number>();
  for (const entry of corpus) {
    const cell = parseCoupangCategoryCell(entry?.categoryCell ?? '');
    const names = uniqueNames(entry);
    if (!cell || names.length === 0) continue;
    parsedCorpus.push({ cell, names });
    supportByCell.set(cell.raw, (supportByCell.get(cell.raw) ?? 0) + 1);
  }
  if (parsedCorpus.length === 0) return null;

  // 엑셀의 등록상품명/노출상품명과 동일한 상품이면 그 카테고리를 최우선한다.
  // 같은 상품명이 서로 다른 카테고리에 걸쳐 있으면 자동선택하지 않고 아래의
  // 저신뢰도 추천으로 내려 보낸다.
  const identityMatches = findIdentityMatches(productName, parsedCorpus);
  const identityCategories = new Set(identityMatches.map((match) => match.cell.raw));
  if (identityMatches.length > 0 && identityCategories.size === 1) {
    const winner = identityMatches[0];
    const evidence = [...new Set(identityMatches.map((match) => match.name))]
      .slice(0, evidenceLimit);
    return {
      cell: winner.cell,
      score: identityMatches.some((match) => match.exact) ? 1 : 0.95,
      confidence: 'high',
      basedOn: evidence,
      support: supportByCell.get(winner.cell.raw) ?? 1,
    };
  }

  const scored: { cell: CoupangCategoryCell; name: string; score: number }[] = [];
  for (const entry of parsedCorpus) {
    const nameScores = entry.names.map((name) => ({
      name,
      score: scoreNameSimilarity(productName, name),
    }));
    const bestName = nameScores.sort((left, right) => right.score - left.score)[0];
    if (!bestName) continue;
    scored.push({
      cell: entry.cell,
      name: bestName.name,
      score: bestName.score,
    });
  }
  if (scored.length === 0) return null;

  scored.sort((left, right) => right.score - left.score);
  const neighbours = scored
    .slice(0, Math.min(NEIGHBOUR_COUNT, scored.length))
    .filter((entry) => entry.score > 0);
  if (neighbours.length === 0) return null;

  const votes = new Map<
    string,
    { cell: CoupangCategoryCell; weight: number; best: number; names: string[] }
  >();
  let totalWeight = 0;
  for (const neighbour of neighbours) {
    const bucket = votes.get(neighbour.cell.raw) ?? {
      cell: neighbour.cell,
      weight: 0,
      best: 0,
      names: [],
    };
    bucket.weight += neighbour.score;
    bucket.best = Math.max(bucket.best, neighbour.score);
    bucket.names.push(neighbour.name);
    votes.set(neighbour.cell.raw, bucket);
    totalWeight += neighbour.score;
  }

  const winner = [...votes.values()].sort(
    (left, right) =>
      right.weight - left.weight
      || right.best - left.best
      || left.cell.raw.localeCompare(right.cell.raw),
  )[0];
  if (!winner || winner.best < minScore) return null;

  const consensus = totalWeight > 0 ? winner.weight / totalWeight : 0;
  const confidence: CategoryConfidence =
    winner.best >= HIGH_SCORE && consensus >= HIGH_CONSENSUS
      ? 'high'
      : consensus >= MEDIUM_CONSENSUS || winner.best >= MEDIUM_SCORE
        ? 'medium'
        : 'low';

  return {
    cell: winner.cell,
    score: winner.best,
    confidence,
    basedOn: winner.names.slice(0, evidenceLimit),
    support: supportByCell.get(winner.cell.raw) ?? winner.names.length,
  };
}
