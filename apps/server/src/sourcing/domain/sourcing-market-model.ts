export const SOURCING_MARKET_MODEL_VERSION = 1;
export const SOURCING_MARKET_MODEL_PIPELINE = 'coupang_first_market_reaction';
export const SOURCING_MARKET_MODEL_GENERATOR_VERSION = 'sourcing-market-model.coupang-first.v1';

export const SOURCING_MARKET_MODEL_SOURCE_SCOPES = [
  'today_recommendations',
  'interest_tracking',
] as const;

export type SourcingMarketModelSourceScope = (typeof SOURCING_MARKET_MODEL_SOURCE_SCOPES)[number];
export type SourcingMarketModelGrade = 'A' | 'B' | 'C' | 'WATCH' | 'EXCLUDE';
export type SourcingMarketModelDecision = 'recommend' | 'watch' | 'exclude';

export interface SourcingMarketModelSourceSnapshot {
  id: string;
  scope: SourcingMarketModelSourceScope;
  businessDate: string;
  payload: Record<string, unknown>;
  updatedAt: string;
}

export interface SourcingMarketModelCandidate {
  id: string;
  rank: number;
  productId: string;
  itemId: string | null;
  vendorItemId: string | null;
  productName: string;
  imagePath: string | null;
  primaryKeyword: string;
  keywords: string[];
  score: number;
  grade: SourcingMarketModelGrade;
  decision: SourcingMarketModelDecision;
  components: {
    marketReaction: number;
    newProductReaction: number;
    interestFit: number;
    marginPotential: number;
    supplyReadiness: number;
    existingRecommendation: number;
    riskPenalty: number;
  };
  metrics: {
    salesLast3d: number;
    salesLast28d: number;
    viewsLast3d: number;
    reviews: number;
    salePrice: number | null;
    conversionRate: number;
    lowReviewSalesPower: number;
    reviewDelta: number | null;
    salesDelta: number | null;
  };
  reasons: string[];
  risks: string[];
  modelTags: string[];
  sourceSnapshotId: string;
  sourceDate: string;
}

export interface SourcingMarketModelResult {
  candidates: SourcingMarketModelCandidate[];
  stats: {
    candidateCount: number;
    sourceSnapshotCount: number;
    recommendedCount: number;
    watchCount: number;
    excludedCount: number;
    averageScore: number;
    topKeyword: string | null;
  };
  model: {
    pipeline: typeof SOURCING_MARKET_MODEL_PIPELINE;
    version: typeof SOURCING_MARKET_MODEL_VERSION;
    generatorVersion: typeof SOURCING_MARKET_MODEL_GENERATOR_VERSION;
    weights: Record<keyof SourcingMarketModelCandidate['components'], number>;
  };
}

const DEFAULT_CANDIDATE_LIMIT = 120;
const MAX_CANDIDATE_LIMIT = 240;

const MODEL_WEIGHTS: Record<keyof SourcingMarketModelCandidate['components'], number> = {
  marketReaction: 0.32,
  newProductReaction: 0.18,
  interestFit: 0.16,
  marginPotential: 0.14,
  supplyReadiness: 0.10,
  existingRecommendation: 0.10,
  riskPenalty: -0.18,
};

export function buildSourcingMarketModel(input: {
  snapshots: SourcingMarketModelSourceSnapshot[];
  limit?: number;
}): SourcingMarketModelResult {
  const limit = normalizeLimit(input.limit);
  const interestTerms = buildInterestTerms(input.snapshots);
  const scored = input.snapshots
    .filter((snapshot) => snapshot.scope === 'today_recommendations')
    .flatMap((snapshot) => buildCandidatesFromRecommendationSnapshot(snapshot, interestTerms));
  const candidates = dedupeCandidates(scored)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

  return {
    candidates,
    stats: buildStats(candidates, input.snapshots.length),
    model: {
      pipeline: SOURCING_MARKET_MODEL_PIPELINE,
      version: SOURCING_MARKET_MODEL_VERSION,
      generatorVersion: SOURCING_MARKET_MODEL_GENERATOR_VERSION,
      weights: MODEL_WEIGHTS,
    },
  };
}

export function isSourcingMarketModelPayload(value: unknown): value is {
  version: 1;
  result: SourcingMarketModelResult;
  meta: { generatedAt: string };
} {
  if (!isRecord(value)) return false;
  if (value.version !== SOURCING_MARKET_MODEL_VERSION) return false;
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

function buildCandidatesFromRecommendationSnapshot(
  snapshot: SourcingMarketModelSourceSnapshot,
  interestTerms: InterestTerm[],
): SourcingMarketModelCandidate[] {
  const result = recordValue(snapshot.payload.result);
  const rows = recordsValue(result?.rows);

  return rows
    .map((row, index) => scoreRecommendationRow(row, snapshot, interestTerms, index))
    .filter((candidate): candidate is SourcingMarketModelCandidate => candidate != null);
}

function scoreRecommendationRow(
  row: Record<string, unknown>,
  snapshot: SourcingMarketModelSourceSnapshot,
  interestTerms: InterestTerm[],
  index: number,
): SourcingMarketModelCandidate | null {
  const productName = firstString(row, ['productName', 'name', 'title']);
  if (!productName) return null;

  const productId = stringValue(row.productId) ?? stableId(`${snapshot.id}:${productName}:${index}`);
  const itemId = stringValue(row.itemId);
  const vendorItemId = stringValue(row.vendorItemId);
  const keywords = compactStrings([
    stringValue(row.primaryKeyword),
    ...stringsValue(row.keywords),
  ]);
  const primaryKeyword = keywords[0] ?? '';
  const salesLast28d = nonNegative(numberValue(row.salesLast28d));
  const salesLast3d = nonNegative(numberValue(row.salesLast3d) ?? estimateThreeDayValue(salesLast28d));
  const viewsLast3d = nonNegative(numberValue(row.pvLast3d) ?? estimateThreeDayValue(nonNegative(numberValue(row.pvLast28Day))));
  const reviews = nonNegative(numberValue(row.ratingCount));
  const salePrice = positiveOrNull(numberValue(row.salePrice));
  const conversionRate = resolveConversionRate(row, salesLast3d, viewsLast3d);
  const lowReviewSalesPower = numberValue(row.lowReviewSalesPower) ?? salesLast3d / Math.max(reviews, 1);
  const salesDelta = nullableNumber(row.salesDelta);
  const reviewDelta = nullableNumber(row.reviewDelta);
  const existingRecommendation = clampScore(numberValue(row.score) ?? 0);
  const risk = scoreRisk({ productName, reviews, salePrice, salesLast3d, viewsLast3d });
  const components = {
    marketReaction: scoreMarketReaction({ row, salesLast3d, conversionRate, lowReviewSalesPower, reviewDelta }),
    newProductReaction: scoreNewProductReaction({ row, salesLast3d, reviews, lowReviewSalesPower, salesDelta, reviewDelta }),
    interestFit: scoreInterestFit({ productName, primaryKeyword, keywords, interestTerms }),
    marginPotential: scoreMarginPotential(salePrice),
    supplyReadiness: scoreSupplyReadiness(row),
    existingRecommendation,
    riskPenalty: risk.score,
  };
  const score = clampScore(Math.round(
    components.marketReaction * MODEL_WEIGHTS.marketReaction +
    components.newProductReaction * MODEL_WEIGHTS.newProductReaction +
    components.interestFit * MODEL_WEIGHTS.interestFit +
    components.marginPotential * MODEL_WEIGHTS.marginPotential +
    components.supplyReadiness * MODEL_WEIGHTS.supplyReadiness +
    components.existingRecommendation * MODEL_WEIGHTS.existingRecommendation +
    components.riskPenalty * MODEL_WEIGHTS.riskPenalty,
  ));
  const grade = gradeFromScore(score, components, salesLast3d, reviews);
  const decision = decisionFromGrade(grade);
  const reasons = buildReasons({ components, salesLast3d, reviews, conversionRate, salePrice, primaryKeyword });
  const rowRisks = stringsValue(row.risks);
  const risks = Array.from(new Set([...risk.risks, ...rowRisks])).slice(0, 5);

  return {
    id: [productId, itemId, vendorItemId].filter(Boolean).join(':') || stableId(productName),
    rank: 0,
    productId,
    itemId,
    vendorItemId,
    productName,
    imagePath: stringValue(row.imagePath) ?? stringValue(row.imageUrl),
    primaryKeyword,
    keywords,
    score,
    grade,
    decision,
    components,
    metrics: {
      salesLast3d,
      salesLast28d,
      viewsLast3d,
      reviews,
      salePrice,
      conversionRate,
      lowReviewSalesPower: roundOne(lowReviewSalesPower),
      reviewDelta,
      salesDelta,
    },
    reasons,
    risks,
    modelTags: buildModelTags(components, grade, decision, risks),
    sourceSnapshotId: snapshot.id,
    sourceDate: snapshot.businessDate,
  };
}

function scoreMarketReaction(input: {
  row: Record<string, unknown>;
  salesLast3d: number;
  conversionRate: number;
  lowReviewSalesPower: number;
  reviewDelta: number | null;
}): number {
  const marketSignal = numberValue(input.row.marketReactionSignal) ?? 0;
  return clampScore(
    Math.min(36, input.salesLast3d * 1.4) +
    Math.min(22, input.conversionRate * 420) +
    Math.min(20, input.lowReviewSalesPower * 6) +
    Math.min(14, marketSignal * 0.45) +
    Math.min(8, Math.max(0, input.reviewDelta ?? 0) * 2),
  );
}

function scoreNewProductReaction(input: {
  row: Record<string, unknown>;
  salesLast3d: number;
  reviews: number;
  lowReviewSalesPower: number;
  salesDelta: number | null;
  reviewDelta: number | null;
}): number {
  let score = 20;
  if (input.reviews <= 80 && input.salesLast3d >= 5) score += 32;
  else if (input.reviews <= 300 && input.salesLast3d >= 8) score += 24;
  else if (input.reviews <= 900) score += 12;

  score += Math.min(20, input.lowReviewSalesPower * 7);
  score += Math.min(16, Math.max(0, input.salesDelta ?? 0) * 3);
  score += Math.min(8, Math.max(0, input.reviewDelta ?? 0) * 2);
  score += Math.min(12, (numberValue(input.row.newEntrySignal) ?? 0) * 3);
  return clampScore(score);
}

function scoreInterestFit(input: {
  productName: string;
  primaryKeyword: string;
  keywords: string[];
  interestTerms: InterestTerm[];
}): number {
  if (input.interestTerms.length === 0) return 50;
  const haystack = normalizeText([input.productName, input.primaryKeyword, ...input.keywords].join(' '));
  let score = 25;
  for (const term of input.interestTerms) {
    const normalized = normalizeText(term.value);
    if (!normalized) continue;
    if (haystack === normalized) score = Math.max(score, 96);
    else if (input.keywords.some((keyword) => normalizeText(keyword) === normalized)) score = Math.max(score, 90);
    else if (normalizeText(input.primaryKeyword) === normalized) score = Math.max(score, 88);
    else if (haystack.includes(normalized)) score = Math.max(score, term.type === 'category' ? 72 : 78);
  }
  return score;
}

function scoreMarginPotential(price: number | null): number {
  if (price == null) return 45;
  if (price >= 9900 && price <= 39900) return 82;
  if (price >= 7000 && price <= 59900) return 64;
  if (price < 7000) return 34;
  if (price <= 89900) return 46;
  return 30;
}

function scoreSupplyReadiness(row: Record<string, unknown>): number {
  const offerCount = numberValue(row.wholesaleOfferCount) ?? numberValue(row.offerCount) ?? 0;
  const matchScore = numberValue(row.wholesaleMatchScore) ?? numberValue(row.matchScore) ?? null;
  const supplierScore = numberValue(row.supplierScore) ?? numberValue(row.serviceScore) ?? null;

  if (offerCount <= 0 && matchScore == null && supplierScore == null) return 42;
  return clampScore(
    35 +
    Math.min(25, offerCount * 5) +
    Math.min(25, matchScore ?? 0) +
    Math.min(15, supplierScore ?? 0),
  );
}

function scoreRisk(input: {
  productName: string;
  reviews: number;
  salePrice: number | null;
  salesLast3d: number;
  viewsLast3d: number;
}): { score: number; risks: string[] } {
  let score = 0;
  const risks: string[] = [];
  const normalized = input.productName.toLowerCase();
  const riskyTerms = ['산리오', '포켓몬', '디즈니', '마블', '짱구', '캐릭터', '정품', '호환'];
  if (riskyTerms.some((term) => normalized.includes(term.toLowerCase()))) {
    score += 35;
    risks.push('IP/브랜드 리스크');
  }
  if (normalized.includes('kc') || normalized.includes('인증')) {
    score += 10;
    risks.push('인증 확인 필요');
  }
  if (input.reviews > 3000) {
    score += 22;
    risks.push('리뷰 장벽 높음');
  } else if (input.reviews > 1500) {
    score += 12;
    risks.push('경쟁 리뷰 누적');
  }
  if (input.salePrice != null && input.salePrice < 7000) {
    score += 12;
    risks.push('단가 낮음');
  }
  if (input.salesLast3d < 2 || input.viewsLast3d < 20) {
    score += 18;
    risks.push('반응 데이터 부족');
  }
  return { score: clampScore(score), risks };
}

function gradeFromScore(
  score: number,
  components: SourcingMarketModelCandidate['components'],
  salesLast3d: number,
  reviews: number,
): SourcingMarketModelGrade {
  if (score >= 76 && components.marketReaction >= 54 && components.riskPenalty <= 45 && salesLast3d >= 8) return 'A';
  if (score >= 64 && components.marketReaction >= 42 && components.riskPenalty <= 58 && reviews <= 2500) return 'B';
  if (score >= 50) return 'C';
  if (score >= 36) return 'WATCH';
  return 'EXCLUDE';
}

function decisionFromGrade(grade: SourcingMarketModelGrade): SourcingMarketModelDecision {
  if (grade === 'A' || grade === 'B') return 'recommend';
  if (grade === 'C' || grade === 'WATCH') return 'watch';
  return 'exclude';
}

function buildReasons(input: {
  components: SourcingMarketModelCandidate['components'];
  salesLast3d: number;
  reviews: number;
  conversionRate: number;
  salePrice: number | null;
  primaryKeyword: string;
}): string[] {
  const reasons: string[] = [];
  if (input.components.marketReaction >= 65) reasons.push('시장 반응 강함');
  else if (input.components.marketReaction >= 45) reasons.push('판매 반응 확인');
  if (input.components.newProductReaction >= 65) reasons.push('신상품 반응 후보');
  if (input.reviews <= 120 && input.salesLast3d >= 5) reasons.push('저리뷰 판매 발생');
  if (input.components.interestFit >= 75) reasons.push('관심 키워드/카테고리 적합');
  if (input.components.marginPotential >= 75) reasons.push('테스트하기 좋은 가격대');
  if (input.components.supplyReadiness >= 65) reasons.push('1688 공급 매칭 신호 있음');
  if (input.conversionRate >= 0.04) reasons.push('조회 대비 구매 전환 양호');
  if (input.primaryKeyword) reasons.push(`${input.primaryKeyword} 기준 후보`);
  return Array.from(new Set(reasons)).slice(0, 5);
}

function buildModelTags(
  components: SourcingMarketModelCandidate['components'],
  grade: SourcingMarketModelGrade,
  decision: SourcingMarketModelDecision,
  risks: string[],
): string[] {
  return compactStrings([
    `grade:${grade}`,
    `decision:${decision}`,
    components.marketReaction >= 60 ? 'market:hot' : null,
    components.newProductReaction >= 60 ? 'new:reacting' : null,
    components.interestFit >= 75 ? 'interest:fit' : null,
    components.supplyReadiness >= 65 ? 'supply:ready' : null,
    risks.length > 0 ? 'risk:check' : null,
  ]);
}

function buildStats(candidates: SourcingMarketModelCandidate[], sourceSnapshotCount: number) {
  const total = candidates.reduce((sum, candidate) => sum + candidate.score, 0);
  const keywordScore = new Map<string, number>();
  for (const candidate of candidates) {
    if (!candidate.primaryKeyword) continue;
    keywordScore.set(candidate.primaryKeyword, (keywordScore.get(candidate.primaryKeyword) ?? 0) + candidate.score);
  }
  return {
    candidateCount: candidates.length,
    sourceSnapshotCount,
    recommendedCount: candidates.filter((candidate) => candidate.decision === 'recommend').length,
    watchCount: candidates.filter((candidate) => candidate.decision === 'watch').length,
    excludedCount: candidates.filter((candidate) => candidate.decision === 'exclude').length,
    averageScore: candidates.length === 0 ? 0 : Math.round(total / candidates.length),
    topKeyword: [...keywordScore.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  };
}

interface InterestTerm {
  value: string;
  type: string;
}

function buildInterestTerms(snapshots: SourcingMarketModelSourceSnapshot[]): InterestTerm[] {
  const terms = snapshots
    .filter((snapshot) => snapshot.scope === 'interest_tracking')
    .flatMap((snapshot) => {
      const result = recordValue(snapshot.payload.result);
      return recordsValue(result?.targets).flatMap((target) => {
        const type = stringValue(target.type) ?? 'target';
        return compactStrings([
          stringValue(target.label),
          stringValue(target.keyword),
          stringValue(target.category),
          stringValue(target.productName),
        ]).map((value) => ({ value, type }));
      });
    });
  const seen = new Set<string>();
  return terms.filter((term) => {
    const key = `${term.type}:${normalizeText(term.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeCandidates(candidates: SourcingMarketModelCandidate[]): SourcingMarketModelCandidate[] {
  const byId = new Map<string, SourcingMarketModelCandidate>();
  for (const candidate of candidates) {
    const current = byId.get(candidate.id);
    if (!current || candidate.score > current.score || candidate.sourceDate > current.sourceDate) {
      byId.set(candidate.id, candidate);
    }
  }
  return [...byId.values()];
}

function normalizeLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_CANDIDATE_LIMIT;
  return Math.max(1, Math.min(MAX_CANDIDATE_LIMIT, Math.floor(limit)));
}

function resolveConversionRate(row: Record<string, unknown>, salesLast3d: number, viewsLast3d: number): number {
  const direct = numberValue(row.conversionRate28d) ?? numberValue(row.conversionRate);
  if (direct != null && direct >= 0) return direct;
  return viewsLast3d > 0 ? salesLast3d / viewsLast3d : 0;
}

function estimateThreeDayValue(value: number | null): number {
  return Math.max(0, Math.round(((value ?? 0) / 28) * 3));
}

function positiveOrNull(value: number | null): number | null {
  if (value == null || value <= 0) return null;
  return Math.round(value);
}

function nonNegative(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function nullableNumber(value: unknown): number | null {
  const number = numberValue(value);
  return number == null ? null : number;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundOne(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
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
  const normalized = value.replace(/[,원%]/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
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
