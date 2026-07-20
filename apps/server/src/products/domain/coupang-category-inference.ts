/**
 * 쿠팡 카테고리 추론.
 *
 * 배경: 수집상품(`SourcingCandidate.category`)은 자유 텍스트라 WING 등록에 바로 쓸 수 없다.
 * WING 등록 폼은 `[displayItemCategoryCode] fullPath` 형식을 요구하고, 그 형식은 이미
 * `ChannelListing.category` 에 쿠팡 워크북 '카테고리' 열 passthrough 로 적재돼 있다.
 * 따라서 기존 리스팅의 (노출상품명 → 카테고리) 쌍을 코퍼스로 삼아 신규 상품명을 분류한다.
 *
 * 이 모듈은 순수 함수만 포함한다 — Prisma/HTTP 의존 없음.
 */

/** `[77390] 완구/취미>스포츠/야외완구>물총` 를 분해한 결과. */
export interface CoupangCategoryCell {
  /** 원본 셀 문자열 (WING 폼에 그대로 넣는 값). */
  raw: string;
  /** displayItemCategoryCode. 쿠팡 getCategories 응답의 code 와 동일하다. */
  code: number;
  /** `완구/취미>스포츠/야외완구>물총` */
  path: string;
  /** 마지막 경로 조각. 카테고리 검색창에 입력하는 leaf 이름. */
  leaf: string;
}

export interface CategoryCorpusEntry {
  /** 쿠팡 노출상품명 (ChannelListing.displayName). */
  displayName: string;
  /** `[코드] 경로` 원본 문자열 (ChannelListing.category). */
  categoryCell: string;
}

export type CategoryConfidence = 'high' | 'medium' | 'low';

export interface CategoryInference {
  cell: CoupangCategoryCell;
  /** 0..1 — 코퍼스 내 최고 유사도. */
  score: number;
  confidence: CategoryConfidence;
  /** 판단 근거가 된 기존 상품명 (최대 3개). */
  basedOn: string[];
  /** 해당 카테고리를 쓰는 코퍼스 항목 수. 동점 시 가중치로 쓰인다. */
  support: number;
}

const CELL_PATTERN = /^\s*\[(\d+)\]\s*(.+?)\s*$/;

/**
 * `[77390] 대>중>소` 를 분해한다. 코드가 없거나 경로가 비면 null.
 *
 * 실데이터에는 `64681/1937` 같은 이형도 섞여 있어(코드만 있고 경로 없음) 반드시 null 을
 * 허용해야 한다. 호출부는 null 을 "추론 실패"로 다루고 하드코딩 프리셋으로 대체하지 않는다.
 */
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

/**
 * 수량/단위 토큰(2개입, 500ml, 30cm …)은 카테고리 판별에 방해가 되므로 제거한다.
 * 복합 단위(`개입`)를 단일 단위(`개`)보다 먼저 두어야 교체가 올바르게 걸린다.
 */
const QUANTITY_TOKEN =
  /^\d+(?:개입|개월|개|입|매|장|종|셋트|세트|p|pcs|g|kg|ml|l|cm|mm|호)?$/;

/**
 * 상품명을 카테고리 판별용 토큰 집합으로 변환한다.
 * 숫자·단위·판촉 문구를 걷어내 "무엇인가"만 남기는 것이 목적이다.
 */
export function tokenizeProductName(value: string): Set<string> {
  const normalized = (value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[[\](){}]/g, ' ');

  const tokens = normalized
    .split(/[^0-9a-z가-힣]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !QUANTITY_TOKEN.test(token))
    .filter((token) => !STOP_TOKENS.has(token));

  return new Set(tokens);
}

/** 한글은 형태소 경계가 불명확해 bigram Dice 가 토큰 완전일치보다 안정적이다. */
function bigrams(value: string): Set<string> {
  const compact = value.replace(/\s+/g, '');
  const out = new Set<string>();
  for (let i = 0; i < compact.length - 1; i += 1) out.add(compact.slice(i, i + 2));
  return out;
}

function sharedCount(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared;
}

function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  return (2 * sharedCount(a, b)) / (a.size + b.size);
}

/**
 * 겹침 계수 = 공유 / min(크기). Dice 와 달리 길이 차이에 벌점을 주지 않는다.
 *
 * 셀피아 상품명은 붙여쓰기('4000과일바구니딸깍이키링'), 쿠팡 노출상품명은 띄어쓰기에
 * 수식어까지 붙는다('4구 스핀 딸깍이 키링 1p 휴대용 불빛 열쇠고리 핸드토이').
 * 이 조합에서 Dice 는 길이 차이로 점수를 뭉개버려 같은 품목도 0.06 수준이 된다.
 */
function overlapCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  return sharedCount(a, b) / Math.min(a.size, b.size);
}

/**
 * 상품명 유사도 0..1.
 *
 * 토큰 겹침(의미)과 bigram 겹침(표기)을 함께 본다. 붙여쓰기 상품명은 토큰이 1개로
 * 뭉쳐 토큰 신호가 0 이 되므로, bigram 쪽이 단독으로도 판정할 수 있어야 한다.
 */
export function scoreNameSimilarity(left: string, right: string): number {
  const tokenScore = diceCoefficient(tokenizeProductName(left), tokenizeProductName(right));
  const gramScore = overlapCoefficient(bigrams(left.toLowerCase()), bigrams(right.toLowerCase()));
  return Math.max(tokenScore, gramScore * 0.85);
}

export interface InferCategoryOptions {
  /** 이 값 미만이면 추론 실패로 보고 null 을 반환한다. 기본 0.2. */
  minScore?: number;
  /** basedOn 에 담을 근거 상품명 개수. 기본 3. */
  evidenceLimit?: number;
}

const HIGH_SCORE = 0.5;
const MEDIUM_SCORE = 0.32;
/** k-NN 투표에 참여시킬 상위 이웃 수. */
const NEIGHBOUR_COUNT = 10;
/** 상위 이웃 투표에서 승자가 가져가야 할 비중. */
const HIGH_CONSENSUS = 0.7;
const MEDIUM_CONSENSUS = 0.45;

/**
 * 기존 리스팅 코퍼스를 근거로 신규 상품명의 쿠팡 카테고리를 추론한다.
 *
 * 확신이 없으면 **null 을 반환한다**. 호출부는 이때 하드코딩 카테고리로 대체하지 말고
 * 사용자에게 선택을 요구해야 한다 — 잘못된 카테고리는 수수료율과 판매 정책을 바꾼다.
 */
export function inferCoupangCategory(
  productName: string,
  corpus: CategoryCorpusEntry[],
  options: InferCategoryOptions = {},
): CategoryInference | null {
  const minScore = options.minScore ?? 0.2;
  const evidenceLimit = options.evidenceLimit ?? 3;

  if (!productName?.trim() || !Array.isArray(corpus) || corpus.length === 0) return null;

  // 1) 코퍼스 전체 점수 매기기.
  const scored: { cell: CoupangCategoryCell; name: string; score: number }[] = [];
  const supportByCell = new Map<string, number>();

  for (const entry of corpus) {
    const cell = parseCoupangCategoryCell(entry?.categoryCell ?? '');
    if (!cell || !entry.displayName?.trim()) continue;
    supportByCell.set(cell.raw, (supportByCell.get(cell.raw) ?? 0) + 1);
    scored.push({ cell, name: entry.displayName, score: scoreNameSimilarity(productName, entry.displayName) });
  }
  if (scored.length === 0) return null;

  // 2) 상위 K개 이웃 투표(k-NN). 단일 최고점보다 "상위 후보들이 같은 카테고리를 가리키는가"가
  //    훨씬 안정적인 신호다 — 붙여쓰기/띄어쓰기 차이로 절대 점수는 낮아도 합의는 선명하다.
  scored.sort((a, b) => b.score - a.score);
  const neighbours = scored.slice(0, Math.min(NEIGHBOUR_COUNT, scored.length)).filter((n) => n.score > 0);
  if (neighbours.length === 0) return null;

  const votes = new Map<string, { cell: CoupangCategoryCell; weight: number; best: number; names: string[] }>();
  let totalWeight = 0;
  for (const n of neighbours) {
    const bucket = votes.get(n.cell.raw) ?? { cell: n.cell, weight: 0, best: 0, names: [] };
    bucket.weight += n.score; // 점수 가중 투표
    if (n.score > bucket.best) bucket.best = n.score;
    bucket.names.push(n.name);
    votes.set(n.cell.raw, bucket);
    totalWeight += n.score;
  }

  const ranked = [...votes.values()].sort(
    (a, b) => b.weight - a.weight || b.best - a.best || a.cell.raw.localeCompare(b.cell.raw),
  );
  const winner = ranked[0];
  if (winner.best < minScore) return null;

  // 3) 합의도 = 승자가 가져간 투표 비중. 이웃 대부분이 같은 카테고리면 1에 가깝다.
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
