/** `[77390] 완구/취미>스포츠/야외완구>물총`를 분해한 결과. */
export interface CoupangCategoryCell {
  raw: string;
  code: number;
  path: string;
  leaf: string;
}

export interface CategoryCorpusEntry {
  displayName: string;
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

const HIGH_SCORE = 0.5;
const MEDIUM_SCORE = 0.32;
const NEIGHBOUR_COUNT = 10;
const HIGH_CONSENSUS = 0.7;
const MEDIUM_CONSENSUS = 0.45;

export function inferCoupangCategory(
  productName: string,
  corpus: CategoryCorpusEntry[],
  options: InferCategoryOptions = {},
): CategoryInference | null {
  const minScore = options.minScore ?? 0.2;
  const evidenceLimit = options.evidenceLimit ?? 3;
  if (!productName?.trim() || !Array.isArray(corpus) || corpus.length === 0) return null;

  const scored: { cell: CoupangCategoryCell; name: string; score: number }[] = [];
  const supportByCell = new Map<string, number>();
  for (const entry of corpus) {
    const cell = parseCoupangCategoryCell(entry?.categoryCell ?? '');
    if (!cell || !entry.displayName?.trim()) continue;
    supportByCell.set(cell.raw, (supportByCell.get(cell.raw) ?? 0) + 1);
    scored.push({
      cell,
      name: entry.displayName,
      score: scoreNameSimilarity(productName, entry.displayName),
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
    consensus >= HIGH_CONSENSUS || winner.best >= HIGH_SCORE
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
