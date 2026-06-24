export const SOURCING_1688_NEW_PRODUCT_MODEL_VERSION = 1;
export const SOURCING_1688_NEW_PRODUCT_MODEL_PIPELINE = '1688_first_new_product_validation';
export const SOURCING_1688_NEW_PRODUCT_MODEL_GENERATOR_VERSION = 'sourcing-market-model.1688-first.v1';

export const SOURCING_1688_NEW_PRODUCT_MODEL_SOURCE_SCOPES = [
  '1688_new_products',
  'today_recommendations',
  'sourcing_market_model',
] as const;

export type Sourcing1688NewProductModelSourceScope = (typeof SOURCING_1688_NEW_PRODUCT_MODEL_SOURCE_SCOPES)[number];
export type Sourcing1688NewProductModelGrade = 'A' | 'B' | 'C' | 'WATCH' | 'EXCLUDE';
export type Sourcing1688NewProductModelDecision = 'order' | 'observe_3d' | 'exclude';
export type Sourcing1688NewProductMatchMethod = 'image' | 'keyword' | 'fuzzy';

export interface Sourcing1688NewProductModelSourceSnapshot {
  id: string;
  scope: Sourcing1688NewProductModelSourceScope;
  businessDate: string;
  payload: Record<string, unknown>;
  updatedAt: string;
}

export interface Sourcing1688NewProductCandidate {
  id: string;
  rank: number;
  offerId: string | null;
  title: string;
  imageUrl: string | null;
  sourceUrl: string;
  keyword: string | null;
  matchMethod: Sourcing1688NewProductMatchMethod;
  score: number;
  grade: Sourcing1688NewProductModelGrade;
  decision: Sourcing1688NewProductModelDecision;
  components: {
    newProductSignal: number;
    supplyQuality: number;
    coupangMatch: number;
    marketReaction: number;
    threeDayValidation: number;
    marginPotential: number;
    riskPenalty: number;
  };
  wholesale: {
    priceCny: number | null;
    monthlySales: number | null;
    tradeScore: number | null;
    repurchaseRate: string | null;
    supplierName: string | null;
    shippingFulfillmentRate: string | null;
    shippingPickupRate: string | null;
    serviceScore: number | null;
    landedCostKrw: number | null;
    estimatedProfitKrw: number | null;
    estimatedMarginRate: number | null;
    sourceDate: string;
  };
  matchedCoupang: {
    productId: string;
    productName: string;
    primaryKeyword: string;
    score: number;
    grade: string;
    salePrice: number | null;
    salesLast3d: number;
    salesLast28d: number;
    reviews: number;
    matchScore: number;
  } | null;
  reasons: string[];
  risks: string[];
  modelTags: string[];
  sourceSnapshotId: string;
  sourceDate: string;
}

export interface Sourcing1688NewProductModelResult {
  candidates: Sourcing1688NewProductCandidate[];
  stats: {
    candidateCount: number;
    sourceSnapshotCount: number;
    orderCount: number;
    observeCount: number;
    excludedCount: number;
    averageScore: number;
    topKeyword: string | null;
  };
  model: {
    pipeline: typeof SOURCING_1688_NEW_PRODUCT_MODEL_PIPELINE;
    version: typeof SOURCING_1688_NEW_PRODUCT_MODEL_VERSION;
    generatorVersion: typeof SOURCING_1688_NEW_PRODUCT_MODEL_GENERATOR_VERSION;
    weights: Record<keyof Sourcing1688NewProductCandidate['components'], number>;
  };
}

const DEFAULT_CANDIDATE_LIMIT = 120;
const MAX_CANDIDATE_LIMIT = 240;
const CNY_TO_KRW = 190;
const LANDED_COST_BUFFER_KRW = 1800;

const MODEL_WEIGHTS: Record<keyof Sourcing1688NewProductCandidate['components'], number> = {
  newProductSignal: 0.16,
  supplyQuality: 0.18,
  coupangMatch: 0.16,
  marketReaction: 0.20,
  threeDayValidation: 0.16,
  marginPotential: 0.14,
  riskPenalty: -0.18,
};

export function buildSourcing1688NewProductModel(input: {
  snapshots: Sourcing1688NewProductModelSourceSnapshot[];
  limit?: number;
}): Sourcing1688NewProductModelResult {
  const limit = normalizeLimit(input.limit);
  const coupangRows = buildCoupangEvidence(input.snapshots);
  const scoredCandidates = input.snapshots
    .filter((snapshot) => snapshot.scope === '1688_new_products')
    .flatMap((snapshot) => buildCandidatesFrom1688Snapshot(snapshot, coupangRows))
    .sort((a, b) => b.score - a.score);
  const candidates = selectRepresentativeMatches(scoredCandidates)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

  return {
    candidates,
    stats: buildStats(candidates, input.snapshots.length),
    model: {
      pipeline: SOURCING_1688_NEW_PRODUCT_MODEL_PIPELINE,
      version: SOURCING_1688_NEW_PRODUCT_MODEL_VERSION,
      generatorVersion: SOURCING_1688_NEW_PRODUCT_MODEL_GENERATOR_VERSION,
      weights: MODEL_WEIGHTS,
    },
  };
}

export function isSourcing1688NewProductModelPayload(value: unknown): value is {
  version: 1;
  result: Sourcing1688NewProductModelResult;
  meta: { generatedAt: string };
} {
  if (!isRecord(value)) return false;
  if (value.version !== SOURCING_1688_NEW_PRODUCT_MODEL_VERSION) return false;
  const result = recordValue(value.result);
  const meta = recordValue(value.meta);
  return Boolean(
    result &&
    meta &&
    Array.isArray(result.candidates) &&
    recordValue(result.stats) &&
    recordValue(result.model) &&
    stringValue(meta.generatedAt),
  );
}

function buildCandidatesFrom1688Snapshot(
  snapshot: Sourcing1688NewProductModelSourceSnapshot,
  coupangRows: CoupangEvidence[],
): Sourcing1688NewProductCandidate[] {
  const result = recordValue(snapshot.payload.result);
  const keyword = stringValue(result?.keyword) ?? stringValue(snapshot.payload.input && recordValue(snapshot.payload.input)?.keyword);
  const rows = [
    ...recordsValue(result?.items),
    ...recordsValue(result?.offers),
    ...recordsValue(result?.rows),
  ];
  const seen = new Set<string>();

  return rows
    .map((row, index) => {
      const candidate = score1688Row(row, snapshot, coupangRows, keyword, index);
      if (!candidate) return null;
      if (seen.has(candidate.id)) return null;
      seen.add(candidate.id);
      return candidate;
    })
    .filter((candidate): candidate is Sourcing1688NewProductCandidate => candidate != null);
}

function selectRepresentativeMatches(
  candidates: Sourcing1688NewProductCandidate[],
): Sourcing1688NewProductCandidate[] {
  const directImageMatches = candidates.filter((candidate) => (
    candidate.matchMethod === 'image' && candidate.matchedCoupang
  ));
  const pool = directImageMatches.length > 0 ? directImageMatches : candidates;
  const bestByCoupangProduct = new Map<string, Sourcing1688NewProductCandidate>();
  const unmatched: Sourcing1688NewProductCandidate[] = [];

  for (const candidate of pool) {
    const productId = candidate.matchedCoupang?.productId;
    if (!productId) {
      unmatched.push(candidate);
      continue;
    }
    const current = bestByCoupangProduct.get(productId);
    if (!current || compareRepresentativeCandidate(candidate, current) > 0) {
      bestByCoupangProduct.set(productId, candidate);
    }
  }

  return [
    ...bestByCoupangProduct.values(),
    ...unmatched,
  ];
}

function compareRepresentativeCandidate(
  left: Sourcing1688NewProductCandidate,
  right: Sourcing1688NewProductCandidate,
): number {
  return (
    left.score - right.score ||
    left.components.coupangMatch - right.components.coupangMatch ||
    left.components.supplyQuality - right.components.supplyQuality ||
    left.components.marginPotential - right.components.marginPotential
  );
}

function score1688Row(
  row: Record<string, unknown>,
  snapshot: Sourcing1688NewProductModelSourceSnapshot,
  coupangRows: CoupangEvidence[],
  keyword: string | null,
  index: number,
): Sourcing1688NewProductCandidate | null {
  const title = firstString(row, ['title', 'productName', 'name']);
  const sourceUrl = stringValue(row.sourceUrl) ?? stringValue(row.url);
  if (!title || !sourceUrl) return null;

  const offerId = stringValue(row.offerId) ?? offerIdFromUrl(sourceUrl);
  const priceCny = positiveOrNull(numberValue(row.priceCny) ?? numberValue(row.price));
  const monthlySales = nonNegative(numberValue(row.monthlySales) ?? numberValue(row.salesNum));
  const tradeScore = positiveOrNull(numberValue(row.tradeScore) ?? numberValue(row.serviceScore) ?? numberValue(row.score));
  const serviceScore = positiveOrNull(numberValue(row.serviceScore));
  const landedCostKrw = positiveOrNull(numberValue(row.landedCostKrw));
  const estimatedProfitKrw = numberValue(row.estimatedProfitKrw);
  const estimatedMarginRate = numberValue(row.estimatedMarginRate);
  const rowKeyword = stringValue(row.keyword) ?? keyword;
  const explicitCoupang = toExplicitCoupangEvidence(row);
  const matchedCoupang = explicitCoupang ?? resolveBestCoupangMatch(title, rowKeyword, coupangRows);
  const matchMethod = explicitCoupang ? 'image' : (rowKeyword ? 'keyword' : 'fuzzy');
  const risk = scoreRisk(title, matchedCoupang);
  const components = {
    newProductSignal: scoreNewProductSignal({ row, snapshot, monthlySales }),
    supplyQuality: scoreSupplyQuality({ priceCny, monthlySales, tradeScore, row }),
    coupangMatch: matchedCoupang?.matchScore ?? 0,
    marketReaction: scoreMarketReaction(matchedCoupang),
    threeDayValidation: scoreThreeDayValidation(matchedCoupang),
    marginPotential: scoreMarginPotential({ row, priceCny, matchedCoupang }),
    riskPenalty: risk.score,
  };
  const score = clampScore(Math.round(
    components.newProductSignal * MODEL_WEIGHTS.newProductSignal +
    components.supplyQuality * MODEL_WEIGHTS.supplyQuality +
    components.coupangMatch * MODEL_WEIGHTS.coupangMatch +
    components.marketReaction * MODEL_WEIGHTS.marketReaction +
    components.threeDayValidation * MODEL_WEIGHTS.threeDayValidation +
    components.marginPotential * MODEL_WEIGHTS.marginPotential +
    components.riskPenalty * MODEL_WEIGHTS.riskPenalty,
  ));
  const grade = gradeFromScore(score, components);
  const decision = decisionFromGrade(grade, components);
  const matched = matchedCoupang ? {
    productId: matchedCoupang.productId,
    productName: matchedCoupang.productName,
    primaryKeyword: matchedCoupang.primaryKeyword,
    score: matchedCoupang.score,
    grade: matchedCoupang.grade,
    salePrice: matchedCoupang.salePrice,
    salesLast3d: matchedCoupang.salesLast3d,
    salesLast28d: matchedCoupang.salesLast28d,
    reviews: matchedCoupang.reviews,
    matchScore: matchedCoupang.matchScore,
  } : null;

  return {
    id: offerId ?? stableId(`${snapshot.id}:${sourceUrl}:${index}`),
    rank: 0,
    offerId,
    title,
    imageUrl: stringValue(row.imageUrl) ?? stringValue(row.imgUrl),
    sourceUrl,
    keyword: rowKeyword,
    matchMethod,
    score,
    grade,
    decision,
    components,
    wholesale: {
      priceCny,
      monthlySales,
      tradeScore,
      repurchaseRate: stringValue(row.repurchaseRate),
      supplierName: stringValue(row.supplierName),
      shippingFulfillmentRate: stringValue(row.shippingFulfillmentRate),
      shippingPickupRate: stringValue(row.shippingPickupRate),
      serviceScore,
      landedCostKrw,
      estimatedProfitKrw,
      estimatedMarginRate,
      sourceDate: snapshot.businessDate,
    },
    matchedCoupang: matched,
    reasons: buildReasons({ components, monthlySales, priceCny, matchedCoupang: matched }),
    risks: risk.risks,
    modelTags: buildModelTags(components, grade, decision, risk.risks),
    sourceSnapshotId: snapshot.id,
    sourceDate: snapshot.businessDate,
  };
}

interface CoupangEvidence {
  productId: string;
  productName: string;
  primaryKeyword: string;
  keywords: string[];
  score: number;
  grade: string;
  salePrice: number | null;
  salesLast3d: number;
  salesLast28d: number;
  reviews: number;
  marketReaction: number;
  threeDayValidation: number;
  tokens: string[];
  matchScore: number;
}

function buildCoupangEvidence(snapshots: Sourcing1688NewProductModelSourceSnapshot[]): CoupangEvidence[] {
  const rows = snapshots.flatMap((snapshot) => {
    const result = recordValue(snapshot.payload.result);
    if (snapshot.scope === 'sourcing_market_model') return recordsValue(result?.candidates);
    if (snapshot.scope === 'today_recommendations') return recordsValue(result?.rows);
    return [];
  });
  const seen = new Set<string>();

  return rows
    .map(toCoupangEvidence)
    .filter((row): row is CoupangEvidence => row != null)
    .filter((row) => {
      if (seen.has(row.productId)) return false;
      seen.add(row.productId);
      return true;
    });
}

function toCoupangEvidence(row: Record<string, unknown>): CoupangEvidence | null {
  const productName = firstString(row, ['productName', 'title', 'name']);
  if (!productName) return null;
  const productId = stringValue(row.productId) ?? stableId(productName);
  const primaryKeyword = stringValue(row.primaryKeyword) ?? stringsValue(row.keywords)[0] ?? '';
  const keywords = compactStrings([primaryKeyword, ...stringsValue(row.keywords)]);
  const components = recordValue(row.components);
  const metrics = recordValue(row.metrics);
  const salesLast3d = nonNegative(numberValue(row.salesLast3d) ?? numberValue(metrics?.salesLast3d));
  const salesLast28d = nonNegative(numberValue(row.salesLast28d) ?? numberValue(metrics?.salesLast28d));
  const reviews = nonNegative(numberValue(row.ratingCount) ?? numberValue(metrics?.reviews));
  const marketReaction = clampScore(numberValue(components?.marketReaction) ?? numberValue(row.marketReactionSignal) ?? 0);
  const threeDayValidation = clampScore(numberValue(components?.newProductReaction) ?? numberValue(row.newEntrySignal) ?? 0);

  return {
    productId,
    productName,
    primaryKeyword,
    keywords,
    score: clampScore(numberValue(row.score) ?? 0),
    grade: stringValue(row.grade) ?? 'WATCH',
    salePrice: positiveOrNull(numberValue(row.salePrice) ?? numberValue(metrics?.salePrice)),
    salesLast3d,
    salesLast28d,
    reviews,
    marketReaction,
    threeDayValidation,
    tokens: tokenize([productName, primaryKeyword, ...keywords].join(' ')),
    matchScore: 0,
  };
}

function toExplicitCoupangEvidence(row: Record<string, unknown>): CoupangEvidence | null {
  const source = recordValue(row.matchedCoupang) ?? recordValue(row.sourceCoupang) ?? recordValue(row.coupangProduct);
  if (!source) return null;
  const productName = firstString(source, ['productName', 'title', 'name']);
  if (!productName) return null;
  const productId = stringValue(source.productId) ?? stableId(productName);
  const primaryKeyword = stringValue(source.primaryKeyword) ?? stringsValue(source.keywords)[0] ?? stringValue(row.keyword) ?? '';
  const keywords = compactStrings([primaryKeyword, ...stringsValue(source.keywords), stringValue(row.keyword)]);
  const salesLast3d = nonNegative(numberValue(source.salesLast3d));
  const salesLast28d = nonNegative(numberValue(source.salesLast28d));
  const reviews = nonNegative(numberValue(source.reviews) ?? numberValue(source.ratingCount));
  const matchScore = clampScore(numberValue(row.imageMatchScore) ?? numberValue(row.matchScore) ?? numberValue(source.matchScore) ?? numberValue(row.score) ?? 0);
  const marketReaction = clampScore(
    numberValue(source.marketReaction) ??
    numberValue(source.marketReactionSignal) ??
    Math.min(100, salesLast3d * 1.4 + matchScore * 0.28),
  );
  const threeDayValidation = clampScore(
    numberValue(source.threeDayValidation) ??
    numberValue(source.newEntrySignal) ??
    Math.min(100, salesLast3d * 1.8 + (reviews <= 300 && salesLast3d >= 5 ? 18 : 0)),
  );

  return {
    productId,
    productName,
    primaryKeyword,
    keywords,
    score: clampScore(numberValue(source.score) ?? 0),
    grade: stringValue(source.grade) ?? 'WATCH',
    salePrice: positiveOrNull(numberValue(source.salePrice) ?? numberValue(row.targetSalePriceKrw)),
    salesLast3d,
    salesLast28d,
    reviews,
    marketReaction,
    threeDayValidation,
    tokens: tokenize([productName, primaryKeyword, ...keywords].join(' ')),
    matchScore,
  };
}

function resolveBestCoupangMatch(title: string, keyword: string | null, rows: CoupangEvidence[]): CoupangEvidence | null {
  const offerTokens = tokenize([title, keyword].filter(Boolean).join(' '));
  if (offerTokens.length === 0 || rows.length === 0) return null;
  const scored = rows
    .map((row) => ({ ...row, matchScore: scoreTokenOverlap(offerTokens, row.tokens) }))
    .filter((row) => row.matchScore >= 18)
    .sort((a, b) => b.matchScore - a.matchScore || b.score - a.score);
  return scored[0] ?? null;
}

function scoreTokenOverlap(a: string[], b: string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  let matched = 0;
  for (const token of left) {
    if (right.has(token)) matched += 1;
  }
  const denominator = Math.max(1, Math.min(left.size, right.size));
  return clampScore((matched / denominator) * 100);
}

function scoreNewProductSignal(input: {
  row: Record<string, unknown>;
  snapshot: Sourcing1688NewProductModelSourceSnapshot;
  monthlySales: number;
}): number {
  const explicit = numberValue(input.row.newProductSignal) ?? numberValue(input.row.newScore);
  if (explicit != null) return clampScore(explicit);
  const createdAt = stringValue(input.row.createdAt) ?? stringValue(input.row.listedAt);
  const ageDays = createdAt ? daysSince(createdAt, input.snapshot.businessDate) : null;
  let score = 58;
  if (ageDays != null && ageDays <= 7) score += 28;
  else if (ageDays != null && ageDays <= 30) score += 16;
  if (input.monthlySales > 0 && input.monthlySales <= 300) score += 10;
  return clampScore(score);
}

function scoreSupplyQuality(input: {
  priceCny: number | null;
  monthlySales: number;
  tradeScore: number | null;
  row: Record<string, unknown>;
}): number {
  let score = 34;
  if (input.priceCny != null && input.priceCny > 0 && input.priceCny <= 60) score += 18;
  else if (input.priceCny != null && input.priceCny <= 120) score += 10;
  score += Math.min(22, Math.log10(input.monthlySales + 1) * 12);
  score += Math.min(16, input.tradeScore ?? 0);
  const fulfillmentRate = percentageValue(input.row.shippingFulfillmentRate);
  const pickupRate = percentageValue(input.row.shippingPickupRate);
  if (fulfillmentRate != null) score += fulfillmentRate >= 95 ? 14 : fulfillmentRate >= 88 ? 8 : 2;
  if (pickupRate != null) score += pickupRate >= 95 ? 12 : pickupRate >= 88 ? 7 : 2;
  if (stringValue(input.row.supplierName)) score += 6;
  if (stringValue(input.row.repurchaseRate)) score += 6;
  if (stringsValue(input.row.supplierTags).some((tag) => /원천|공장|factory|实力|源头/i.test(tag))) score += 6;
  return clampScore(score);
}

function scoreMarketReaction(match: CoupangEvidence | null): number {
  if (!match) return 0;
  return clampScore(
    match.marketReaction * 0.58 +
    Math.min(28, match.salesLast3d * 1.4) +
    Math.min(14, match.score * 0.16),
  );
}

function scoreThreeDayValidation(match: CoupangEvidence | null): number {
  if (!match) return 0;
  return clampScore(
    match.threeDayValidation * 0.52 +
    Math.min(32, match.salesLast3d * 1.8) +
    (match.reviews <= 300 && match.salesLast3d >= 5 ? 18 : 0),
  );
}

function scoreMarginPotential(input: {
  row: Record<string, unknown>;
  priceCny: number | null;
  matchedCoupang: CoupangEvidence | null;
}): number {
  const explicitProfit = numberValue(input.row.estimatedProfitKrw);
  const explicitMarginRate = numberValue(input.row.estimatedMarginRate);
  if (explicitProfit != null || explicitMarginRate != null) {
    let score = 32;
    if (explicitProfit != null) {
      if (explicitProfit >= 7000) score += 36;
      else if (explicitProfit >= 4500) score += 28;
      else if (explicitProfit >= 2500) score += 18;
      else if (explicitProfit >= 1000) score += 8;
      else score -= 16;
    }
    if (explicitMarginRate != null) {
      if (explicitMarginRate >= 35) score += 28;
      else if (explicitMarginRate >= 24) score += 20;
      else if (explicitMarginRate >= 14) score += 10;
      else score -= 12;
    }
    return clampScore(score);
  }
  if (input.priceCny == null) return 35;
  const landedCost = numberValue(input.row.landedCostKrw) ?? input.priceCny * CNY_TO_KRW + LANDED_COST_BUFFER_KRW;
  const targetSalePrice = input.matchedCoupang?.salePrice ?? positiveOrNull(numberValue(input.row.targetSalePriceKrw));
  if (!targetSalePrice) {
    if (input.priceCny <= 30) return 64;
    if (input.priceCny <= 80) return 52;
    return 34;
  }
  const grossMargin = targetSalePrice - landedCost;
  const marginRate = grossMargin / targetSalePrice;
  if (grossMargin >= 6000 && marginRate >= 0.35) return 88;
  if (grossMargin >= 3500 && marginRate >= 0.22) return 72;
  if (grossMargin >= 1500) return 52;
  return 24;
}

function scoreRisk(title: string, match: CoupangEvidence | null): { score: number; risks: string[] } {
  let score = 0;
  const risks: string[] = [];
  const normalized = title.toLowerCase();
  const riskyTerms = ['산리오', '포켓몬', '디즈니', '마블', '짱구', '캐릭터', '정품', '호환', '奥特曼', '迪士尼'];
  if (riskyTerms.some((term) => normalized.includes(term.toLowerCase()))) {
    score += 35;
    risks.push('IP/브랜드 리스크');
  }
  if (normalized.includes('kc') || normalized.includes('认证') || normalized.includes('인증')) {
    score += 10;
    risks.push('인증 확인 필요');
  }
  if (!match) {
    score += 18;
    risks.push('쿠팡 매칭 근거 부족');
  }
  if (match && match.reviews > 2500) {
    score += 16;
    risks.push('쿠팡 경쟁 리뷰 장벽');
  }
  return { score: clampScore(score), risks };
}

function gradeFromScore(
  score: number,
  components: Sourcing1688NewProductCandidate['components'],
): Sourcing1688NewProductModelGrade {
  if (score >= 78 && components.coupangMatch >= 45 && components.threeDayValidation >= 55 && components.riskPenalty <= 45) return 'A';
  if (score >= 64 && components.coupangMatch >= 35 && components.marketReaction >= 45 && components.riskPenalty <= 60) return 'B';
  if (score >= 50) return 'C';
  if (score >= 36) return 'WATCH';
  return 'EXCLUDE';
}

function decisionFromGrade(
  grade: Sourcing1688NewProductModelGrade,
  components: Sourcing1688NewProductCandidate['components'],
): Sourcing1688NewProductModelDecision {
  if ((grade === 'A' || grade === 'B') && components.threeDayValidation >= 60 && components.marginPotential >= 55) return 'order';
  if (grade === 'A' || grade === 'B' || grade === 'C' || grade === 'WATCH') return 'observe_3d';
  return 'exclude';
}

function buildReasons(input: {
  components: Sourcing1688NewProductCandidate['components'];
  monthlySales: number;
  priceCny: number | null;
  matchedCoupang: Sourcing1688NewProductCandidate['matchedCoupang'];
}): string[] {
  const reasons: string[] = [];
  if (input.components.newProductSignal >= 70) reasons.push('1688 신상품 신호');
  if (input.components.supplyQuality >= 60) reasons.push('1688 공급처/거래 신호 양호');
  if (input.matchedCoupang) reasons.push('쿠팡 유사 상품 매칭');
  if (input.components.marketReaction >= 55) reasons.push('쿠팡 시장 반응 확인');
  if (input.components.threeDayValidation >= 60) reasons.push('3일 반응 검증 통과 후보');
  if (input.components.marginPotential >= 65) reasons.push('마진 가능성 양호');
  if (input.monthlySales > 0) reasons.push(`1688 거래 ${input.monthlySales}건 신호`);
  if (input.priceCny != null) reasons.push(`1688 단가 ¥${input.priceCny}`);
  return Array.from(new Set(reasons)).slice(0, 6);
}

function buildModelTags(
  components: Sourcing1688NewProductCandidate['components'],
  grade: Sourcing1688NewProductModelGrade,
  decision: Sourcing1688NewProductModelDecision,
  risks: string[],
): string[] {
  return compactStrings([
    `pipeline:${SOURCING_1688_NEW_PRODUCT_MODEL_PIPELINE}`,
    `grade:${grade}`,
    `decision:${decision}`,
    components.newProductSignal >= 70 ? '1688:new' : null,
    components.threeDayValidation >= 60 ? 'coupang:3d-validated' : null,
    components.marginPotential >= 65 ? 'margin:ok' : null,
    risks.length > 0 ? 'risk:check' : null,
  ]);
}

function buildStats(candidates: Sourcing1688NewProductCandidate[], sourceSnapshotCount: number) {
  const total = candidates.reduce((sum, candidate) => sum + candidate.score, 0);
  const keywordScore = new Map<string, number>();
  for (const candidate of candidates) {
    if (!candidate.keyword) continue;
    keywordScore.set(candidate.keyword, (keywordScore.get(candidate.keyword) ?? 0) + candidate.score);
  }
  return {
    candidateCount: candidates.length,
    sourceSnapshotCount,
    orderCount: candidates.filter((candidate) => candidate.decision === 'order').length,
    observeCount: candidates.filter((candidate) => candidate.decision === 'observe_3d').length,
    excludedCount: candidates.filter((candidate) => candidate.decision === 'exclude').length,
    averageScore: candidates.length === 0 ? 0 : Math.round(total / candidates.length),
    topKeyword: [...keywordScore.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_CANDIDATE_LIMIT;
  return Math.max(1, Math.min(MAX_CANDIDATE_LIMIT, Math.floor(limit)));
}

function daysSince(value: string, businessDate: string): number | null {
  const from = Date.parse(value);
  const to = Date.parse(`${businessDate}T00:00:00.000Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, Math.floor((to - from) / (24 * 60 * 60 * 1000)));
}

function tokenize(value: string): string[] {
  return compactStrings(value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .flatMap((token) => {
      if (token.length <= 2) return [token];
      if (/[\u4e00-\u9fff가-힣]/.test(token)) return [token, ...charNgrams(token, 2)];
      return [token];
    }))
    .filter((token) => token.length >= 2);
}

function charNgrams(value: string, size: number): string[] {
  const grams: string[] = [];
  for (let index = 0; index <= value.length - size; index += 1) {
    grams.push(value.slice(index, index + size));
  }
  return grams;
}

function offerIdFromUrl(value: string): string | null {
  return /offer(?:detail)?\/(\d+)\.html/.exec(value)?.[1] ?? /offerId=(\d+)/.exec(value)?.[1] ?? null;
}

function positiveOrNull(value: number | null): number | null {
  if (value == null || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

function nonNegative(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))));
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return null;
}

function stringsValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return compactStrings(value.map((item) => stringValue(item)));
}

function recordsValue(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[,원¥￥%]/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentageValue(value: unknown): number | null {
  const parsed = numberValue(value);
  if (parsed == null) return null;
  return parsed <= 1 ? parsed * 100 : parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function stableId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}
