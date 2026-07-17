import {
  scoreSourcingOpportunity,
  type SourcingOpportunityScore,
} from './opportunity-score';

// Pure "rising product" detector over Coupang keyword-SERP evidence.
//
// The candidate universe is the set of products already captured in daily SERP
// snapshots for tracked keywords (there is no public Coupang new-products feed).
// Since real sales are hidden on the open surface, momentum is proxied by review
// growth velocity and organic SERP rank climb; Wing 28-day sales, when present,
// confirm/adjust that proxy with real units. Freshness is inferred (there is no
// launch date) from first-seen recency + low absolute review count, and
// trend-fit comes from Naver keyword demand direction.

export const SOURCING_RISING_PRODUCT_MODEL_VERSION = 1;
export const SOURCING_RISING_PRODUCT_MODEL_PIPELINE = 'coupang_serp_rising_product';
export const SOURCING_RISING_PRODUCT_MODEL_GENERATOR_VERSION =
  'sourcing.coupang-serp-rising.v1';

export type SourcingRisingProductGrade = 'A' | 'B' | 'C' | 'WATCH' | 'EXCLUDE';
export type SourcingRisingProductDecision = 'order' | 'observe_3d' | 'exclude';

/** One product row inside a daily SERP snapshot (organic + ads). */
export interface RisingSerpItemInput {
  isAd: boolean;
  rank: number | null;
  productId: string | null;
  vendorItemId: string | null;
  name: string | null;
  priceKrw: number | null;
  reviewCount: number | null;
  ratingScore: number | null;
  link: string | null;
}

/** One keyword's daily SERP snapshot. */
export interface RisingSerpSnapshotInput {
  keyword: string;
  /** KST business date, `YYYY-MM-DD`. */
  businessDate: string;
  items: RisingSerpItemInput[];
}

/** One Wing sales-rank daily fact (real 28-day units), own products only. */
export interface RisingWingSalesInput {
  keyword: string;
  businessDate: string;
  vendorItemId: string;
  salesLast28d: number | null;
  salesRank: number | null;
  salePrice: number | null;
  reviewCount: number | null;
}

/** Naver keyword demand signal for trend-fit. */
export interface RisingTrendInput {
  keyword: string;
  trendDelta: number | null;
  monthlyTotalSearchCount: number | null;
}

export interface SourcingRisingProductCandidate {
  id: string;
  rank: number;
  keyword: string;
  vendorItemId: string | null;
  productId: string | null;
  productName: string;
  productUrl: string | null;
  latestPriceKrw: number | null;
  latestReviewCount: number | null;
  latestRatingScore: number | null;
  latestOrganicRank: number | null;
  score: number;
  grade: SourcingRisingProductGrade;
  decision: SourcingRisingProductDecision;
  components: {
    momentum: number;
    freshness: number;
    trendFit: number;
    riskPenalty: number;
  };
  signals: {
    spanDays: number;
    observationDays: number;
    firstSeenBusinessDate: string;
    daysSinceFirstSeen: number;
    reviewGrowth: number;
    reviewVelocityPerDay: number;
    rankClimb: number | null;
    salesLast28d: number | null;
    salesVelocityPerDay: number | null;
    hasWingSales: boolean;
    trendDelta: number | null;
    monthlySearchVolume: number | null;
  };
  reasons: string[];
  risks: string[];
  modelTags: string[];
  sourceDate: string;
}

export interface SourcingRisingProductModelResult {
  candidates: SourcingRisingProductCandidate[];
  stats: {
    candidateCount: number;
    serpSnapshotCount: number;
    keywordCount: number;
    orderCount: number;
    observeCount: number;
    excludedCount: number;
    withWingSalesCount: number;
    insufficientHistoryCount: number;
    averageScore: number;
    topKeyword: string | null;
  };
  model: {
    pipeline: typeof SOURCING_RISING_PRODUCT_MODEL_PIPELINE;
    version: typeof SOURCING_RISING_PRODUCT_MODEL_VERSION;
    generatorVersion: typeof SOURCING_RISING_PRODUCT_MODEL_GENERATOR_VERSION;
    weights: Record<keyof SourcingRisingProductCandidate['components'], number>;
  };
}

const DEFAULT_CANDIDATE_LIMIT = 100;
const MAX_CANDIDATE_LIMIT = 200;
const REVIEW_YOUNG_THRESHOLD = 300;
const REVIEW_BARRIER_THRESHOLD = 2500;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const MODEL_WEIGHTS: Record<keyof SourcingRisingProductCandidate['components'], number> = {
  momentum: 0.45,
  freshness: 0.25,
  trendFit: 0.3,
  riskPenalty: -0.2,
};

const IP_RISK_TERMS = [
  '산리오',
  '포켓몬',
  '디즈니',
  '마블',
  '짱구',
  '캐릭터',
  '정품',
  '헬로키티',
  '카카오프렌즈',
  '뽀로로',
  '시나모롤',
];

export function buildSourcingRisingProductModel(input: {
  serpSnapshots: RisingSerpSnapshotInput[];
  wingSales?: RisingWingSalesInput[];
  trends?: RisingTrendInput[];
  todayBusinessDate: string;
  limit?: number;
}): SourcingRisingProductModelResult {
  const limit = normalizeLimit(input.limit);
  const trendByKeyword = indexTrends(input.trends ?? []);
  const wingByProduct = indexWingSales(input.wingSales ?? []);
  const series = buildProductSeries(input.serpSnapshots);

  let insufficientHistoryCount = 0;
  const scored: SourcingRisingProductCandidate[] = [];
  for (const entry of series.values()) {
    if (entry.observations.length < 2) {
      insufficientHistoryCount += 1;
      continue;
    }
    const candidate = scoreSeries(entry, {
      todayBusinessDate: input.todayBusinessDate,
      trend: trendByKeyword.get(normalizeText(entry.keyword)) ?? null,
      wing: resolveWing(entry, wingByProduct),
      keywordCompetitorCount: keywordCompetitorCount(entry, input.serpSnapshots),
    });
    if (candidate) scored.push(candidate);
  }

  const candidates = selectRepresentativeByProduct(scored)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

  return {
    candidates,
    stats: buildStats(candidates, input.serpSnapshots, insufficientHistoryCount),
    model: {
      pipeline: SOURCING_RISING_PRODUCT_MODEL_PIPELINE,
      version: SOURCING_RISING_PRODUCT_MODEL_VERSION,
      generatorVersion: SOURCING_RISING_PRODUCT_MODEL_GENERATOR_VERSION,
      weights: MODEL_WEIGHTS,
    },
  };
}

export function isSourcingRisingProductModelPayload(value: unknown): value is {
  version: 1;
  result: SourcingRisingProductModelResult;
  meta: { generatedAt: string };
} {
  if (!isRecord(value)) return false;
  if (value.version !== SOURCING_RISING_PRODUCT_MODEL_VERSION) return false;
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

interface ProductObservation {
  businessDate: string;
  organicRank: number | null;
  overallRank: number | null;
  reviewCount: number | null;
  priceKrw: number | null;
  ratingScore: number | null;
  name: string | null;
  link: string | null;
  everOrganic: boolean;
}

interface ProductSeriesEntry {
  productKey: string;
  keyword: string;
  vendorItemId: string | null;
  productId: string | null;
  observations: ProductObservation[];
}

/** Group SERP items into a per-(keyword, product) daily time series. */
function buildProductSeries(
  snapshots: RisingSerpSnapshotInput[],
): Map<string, ProductSeriesEntry> {
  const series = new Map<string, ProductSeriesEntry>();
  for (const snapshot of snapshots) {
    const keyword = snapshot.keyword.trim();
    if (!keyword) continue;
    // One product can appear multiple times in a day (ad + organic). Fold to the
    // best organic rank / lowest overall rank per product per day.
    const perDay = new Map<string, ProductObservation & { productKey: string; vendorItemId: string | null; productId: string | null }>();
    for (const item of snapshot.items) {
      const identity = productIdentity(item);
      if (!identity) continue;
      const productKey = `${normalizeText(keyword)}::${identity.key}`;
      const organicRank = item.isAd ? null : intOrNull(item.rank);
      const overallRank = intOrNull(item.rank);
      const existing = perDay.get(productKey);
      if (!existing) {
        perDay.set(productKey, {
          productKey,
          vendorItemId: identity.vendorItemId,
          productId: identity.productId,
          businessDate: snapshot.businessDate,
          organicRank,
          overallRank,
          reviewCount: intOrNull(item.reviewCount),
          priceKrw: intOrNull(item.priceKrw),
          ratingScore: numberOrNull(item.ratingScore),
          name: stringValue(item.name),
          link: stringValue(item.link),
          everOrganic: !item.isAd,
        });
        continue;
      }
      existing.organicRank = minRank(existing.organicRank, organicRank);
      existing.overallRank = minRank(existing.overallRank, overallRank);
      existing.reviewCount = maxOrExisting(existing.reviewCount, intOrNull(item.reviewCount));
      existing.priceKrw = existing.priceKrw ?? intOrNull(item.priceKrw);
      existing.ratingScore = existing.ratingScore ?? numberOrNull(item.ratingScore);
      existing.name = existing.name ?? stringValue(item.name);
      existing.link = existing.link ?? stringValue(item.link);
      existing.everOrganic = existing.everOrganic || !item.isAd;
    }

    for (const observation of perDay.values()) {
      const entry = series.get(observation.productKey);
      if (!entry) {
        series.set(observation.productKey, {
          productKey: observation.productKey,
          keyword,
          vendorItemId: observation.vendorItemId,
          productId: observation.productId,
          observations: [toObservation(observation)],
        });
        continue;
      }
      entry.vendorItemId = entry.vendorItemId ?? observation.vendorItemId;
      entry.productId = entry.productId ?? observation.productId;
      entry.observations.push(toObservation(observation));
    }
  }

  for (const entry of series.values()) {
    entry.observations.sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  }
  return series;
}

function toObservation(
  raw: ProductObservation & { productKey: string },
): ProductObservation {
  return {
    businessDate: raw.businessDate,
    organicRank: raw.organicRank,
    overallRank: raw.overallRank,
    reviewCount: raw.reviewCount,
    priceKrw: raw.priceKrw,
    ratingScore: raw.ratingScore,
    name: raw.name,
    link: raw.link,
    everOrganic: raw.everOrganic,
  };
}

function scoreSeries(
  entry: ProductSeriesEntry,
  context: {
    todayBusinessDate: string;
    trend: RisingTrendInput | null;
    wing: WingSeries | null;
    keywordCompetitorCount: number;
  },
): SourcingRisingProductCandidate | null {
  const observations = entry.observations;
  const oldest = observations[0];
  const latest = observations[observations.length - 1];
  const productName = latestNonNull(observations, 'name') ?? entry.vendorItemId ?? entry.productId;
  if (!productName) return null;

  const spanDays = Math.max(1, daysBetween(oldest.businessDate, latest.businessDate));
  const observationDays = new Set(observations.map((o) => o.businessDate)).size;
  const firstSeenBusinessDate = oldest.businessDate;
  const daysSinceFirstSeen = Math.max(0, daysBetween(firstSeenBusinessDate, context.todayBusinessDate));

  const oldestReview = firstNonNullNumber(observations, 'reviewCount');
  const latestReview = latest.reviewCount ?? oldestReview;
  const reviewGrowth = oldestReview != null && latestReview != null
    ? Math.max(0, latestReview - oldestReview)
    : 0;
  const reviewVelocityPerDay = round2(reviewGrowth / spanDays);
  const reviewGrowth7d = round2(reviewVelocityPerDay * 7);

  const oldestOrganic = firstNonNullNumber(observations, 'organicRank');
  const latestOrganic = lastNonNullNumber(observations, 'organicRank');
  const rankClimb = oldestOrganic != null && latestOrganic != null
    ? oldestOrganic - latestOrganic
    : null;
  const rankDelta7d = rankClimb == null ? 0 : -rankClimb; // negative = climbed up

  const riskFlags = collectRiskFlags(productName, latestReview, everOrganic(observations));
  const opportunity = scoreSourcingOpportunity({
    reviewGrowth7d,
    rankDelta7d,
    sellerCount: context.keywordCompetitorCount,
    priceKrw: latest.priceKrw ?? 0,
    estimatedLandedCostKrw: 0,
    supplierConfidence: 0,
    riskFlags,
  });

  const wingConfirm = context.wing;
  const salesLast28d = wingConfirm?.latestSales ?? null;
  const salesVelocityPerDay = wingConfirm?.salesVelocityPerDay ?? null;
  const hasWingSales = wingConfirm != null && salesLast28d != null;

  const momentum = scoreMomentum(opportunity, {
    hasWingSales,
    salesVelocityPerDay,
    salesLast28d,
  });
  const freshness = scoreFreshness(opportunity, {
    daysSinceFirstSeen,
    latestReviewCount: latestReview,
  });
  const trendFit = scoreTrendFit(context.trend);
  const riskPenalty = scoreRiskPenalty(riskFlags, observationDays);

  const score = clampScore(
    momentum * MODEL_WEIGHTS.momentum +
      freshness * MODEL_WEIGHTS.freshness +
      trendFit * MODEL_WEIGHTS.trendFit +
      riskPenalty * MODEL_WEIGHTS.riskPenalty,
  );
  const components = { momentum, freshness, trendFit, riskPenalty };
  const grade = gradeFromScore(score, components, { observationDays, hasWingSales, salesVelocityPerDay });
  const decision = decisionFromGrade(grade, components, { hasWingSales, salesVelocityPerDay });

  return {
    id: entry.vendorItemId ?? entry.productId ?? stableId(entry.productKey),
    rank: 0,
    keyword: entry.keyword,
    vendorItemId: entry.vendorItemId,
    productId: entry.productId,
    productName,
    productUrl: latestNonNull(observations, 'link'),
    latestPriceKrw: latest.priceKrw,
    latestReviewCount: latestReview,
    latestRatingScore: latest.ratingScore,
    latestOrganicRank: latestOrganic,
    score,
    grade,
    decision,
    components,
    signals: {
      spanDays,
      observationDays,
      firstSeenBusinessDate,
      daysSinceFirstSeen,
      reviewGrowth,
      reviewVelocityPerDay,
      rankClimb,
      salesLast28d,
      salesVelocityPerDay,
      hasWingSales,
      trendDelta: context.trend?.trendDelta ?? null,
      monthlySearchVolume: context.trend?.monthlyTotalSearchCount ?? null,
    },
    reasons: buildReasons({
      reviewVelocityPerDay,
      rankClimb,
      hasWingSales,
      salesLast28d,
      salesVelocityPerDay,
      trend: context.trend,
      latestReview,
    }),
    risks: riskFlags,
    modelTags: buildModelTags(components, grade, decision, hasWingSales, riskFlags),
    sourceDate: latest.businessDate,
  };
}

function scoreMomentum(
  opportunity: SourcingOpportunityScore,
  wing: {
    hasWingSales: boolean;
    salesVelocityPerDay: number | null;
    salesLast28d: number | null;
  },
): number {
  if (!wing.hasWingSales) return opportunity.demandScore;
  const delta = wingConfirmationDelta(wing.salesVelocityPerDay, wing.salesLast28d);
  return clampScore(opportunity.demandScore + delta);
}

/** Real Wing sales adjust the review/rank proxy by -15..+15. */
function wingConfirmationDelta(
  velocityPerDay: number | null,
  level: number | null,
): number {
  const levelBoost = Math.min(12, Math.log10((level ?? 0) + 1) * 5);
  if (velocityPerDay == null) return levelBoost * 0.5;
  if (velocityPerDay > 0) return Math.min(15, levelBoost + velocityPerDay * 2);
  if (velocityPerDay < 0) return Math.max(-15, velocityPerDay * 3);
  return levelBoost;
}

function scoreFreshness(
  opportunity: SourcingOpportunityScore,
  input: { daysSinceFirstSeen: number; latestReviewCount: number | null },
): number {
  const firstSeenRecency = clampScore(100 / (1 + input.daysSinceFirstSeen));
  const youngGate = input.latestReviewCount == null
    ? 45
    : input.latestReviewCount < REVIEW_YOUNG_THRESHOLD
      ? 100
      : input.latestReviewCount < 1000
        ? 55
        : 20;
  return clampScore(firstSeenRecency * 0.45 + youngGate * 0.35 + opportunity.noveltyScore * 0.2);
}

function scoreTrendFit(trend: RisingTrendInput | null): number {
  if (!trend) return 30;
  const deltaScore = trend.trendDelta == null ? 40 : clampScore(50 + trend.trendDelta * 2);
  const volumeScore = trend.monthlyTotalSearchCount == null
    ? 30
    : clampScore(Math.log10(trend.monthlyTotalSearchCount + 1) * 22);
  return clampScore(deltaScore * 0.6 + volumeScore * 0.4);
}

function scoreRiskPenalty(riskFlags: string[], observationDays: number): number {
  let score = 0;
  if (riskFlags.some((flag) => flag.includes('IP/브랜드'))) score += 35;
  if (riskFlags.some((flag) => flag.includes('리뷰 장벽'))) score += 18;
  if (riskFlags.some((flag) => flag.includes('광고 노출'))) score += 22;
  if (observationDays < 3) score += 8;
  return clampScore(score);
}

function collectRiskFlags(
  name: string,
  latestReviewCount: number | null,
  everOrganicFlag: boolean,
): string[] {
  const flags: string[] = [];
  const normalized = name.toLowerCase();
  if (IP_RISK_TERMS.some((term) => normalized.includes(term.toLowerCase()))) {
    flags.push('IP/브랜드 리스크');
  }
  if (latestReviewCount != null && latestReviewCount > REVIEW_BARRIER_THRESHOLD) {
    flags.push('쿠팡 리뷰 장벽');
  }
  if (!everOrganicFlag) {
    flags.push('광고 노출 의존(오가닉 미확인)');
  }
  return flags;
}

function gradeFromScore(
  score: number,
  components: SourcingRisingProductCandidate['components'],
  context: { observationDays: number; hasWingSales: boolean; salesVelocityPerDay: number | null },
): SourcingRisingProductGrade {
  const salesDeclining = context.hasWingSales && (context.salesVelocityPerDay ?? 0) < 0;
  if (
    score >= 76 &&
    components.momentum >= 60 &&
    components.riskPenalty <= 40 &&
    context.observationDays >= 2 &&
    !salesDeclining
  ) {
    return 'A';
  }
  if (score >= 62 && components.momentum >= 45 && components.riskPenalty <= 55) return 'B';
  if (score >= 48) return 'C';
  if (score >= 34) return 'WATCH';
  return 'EXCLUDE';
}

function decisionFromGrade(
  grade: SourcingRisingProductGrade,
  components: SourcingRisingProductCandidate['components'],
  context: { hasWingSales: boolean; salesVelocityPerDay: number | null },
): SourcingRisingProductDecision {
  const salesConfirmed = !context.hasWingSales || (context.salesVelocityPerDay ?? 0) >= 0;
  if ((grade === 'A' || grade === 'B') && components.momentum >= 60 && components.trendFit >= 45 && salesConfirmed) {
    return 'order';
  }
  if (grade === 'EXCLUDE') return 'exclude';
  return 'observe_3d';
}

function buildReasons(input: {
  reviewVelocityPerDay: number;
  rankClimb: number | null;
  hasWingSales: boolean;
  salesLast28d: number | null;
  salesVelocityPerDay: number | null;
  trend: RisingTrendInput | null;
  latestReview: number | null;
}): string[] {
  const reasons: string[] = [];
  if (input.reviewVelocityPerDay > 0) reasons.push(`리뷰 +${input.reviewVelocityPerDay}/일 증가`);
  if (input.rankClimb != null && input.rankClimb > 0) reasons.push(`오가닉 순위 ${input.rankClimb}계단 상승`);
  if (input.latestReview != null && input.latestReview < REVIEW_YOUNG_THRESHOLD) {
    reasons.push(`리뷰 ${input.latestReview}개(신상 구간)`);
  }
  if (input.hasWingSales && input.salesLast28d != null) {
    reasons.push(`Wing 실판매 28일 ${input.salesLast28d}건`);
  }
  if (input.hasWingSales && input.salesVelocityPerDay != null && input.salesVelocityPerDay > 0) {
    reasons.push('실판매 상승 확인');
  }
  if (input.trend?.trendDelta != null && input.trend.trendDelta > 0) {
    reasons.push('네이버 검색 트렌드 상승');
  }
  return Array.from(new Set(reasons)).slice(0, 6);
}

function buildModelTags(
  components: SourcingRisingProductCandidate['components'],
  grade: SourcingRisingProductGrade,
  decision: SourcingRisingProductDecision,
  hasWingSales: boolean,
  riskFlags: string[],
): string[] {
  return compactStrings([
    `pipeline:${SOURCING_RISING_PRODUCT_MODEL_PIPELINE}`,
    `grade:${grade}`,
    `decision:${decision}`,
    components.momentum >= 60 ? 'momentum:strong' : null,
    components.freshness >= 60 ? 'fresh:new' : null,
    components.trendFit >= 55 ? 'trend:rising' : null,
    hasWingSales ? 'wing:sales-confirmed' : 'wing:proxy-only',
    riskFlags.length > 0 ? 'risk:check' : null,
  ]);
}

/** Keep the best-scoring keyword instance per product (a product can rank under several keywords). */
function selectRepresentativeByProduct(
  candidates: SourcingRisingProductCandidate[],
): SourcingRisingProductCandidate[] {
  const best = new Map<string, SourcingRisingProductCandidate>();
  const passthrough: SourcingRisingProductCandidate[] = [];
  for (const candidate of candidates) {
    const productKey = candidate.vendorItemId ?? candidate.productId;
    if (!productKey) {
      passthrough.push(candidate);
      continue;
    }
    const current = best.get(productKey);
    if (!current || candidate.score > current.score) best.set(productKey, candidate);
  }
  return [...best.values(), ...passthrough];
}

interface WingSeries {
  latestSales: number | null;
  salesVelocityPerDay: number | null;
}

function indexWingSales(rows: RisingWingSalesInput[]): Map<string, WingSeries> {
  const byProduct = new Map<string, RisingWingSalesInput[]>();
  for (const row of rows) {
    if (!row.vendorItemId) continue;
    for (const keyword of keywordVariants(row.keyword)) {
      const productKey = `${keyword}::vendor:${row.vendorItemId}`;
      byProduct.set(productKey, [...(byProduct.get(productKey) ?? []), row]);
    }
    // Also index product-only so a product surfaced under any keyword can join.
    const productOnly = `vendor:${row.vendorItemId}`;
    byProduct.set(productOnly, [...(byProduct.get(productOnly) ?? []), row]);
  }
  const series = new Map<string, WingSeries>();
  for (const [key, group] of byProduct.entries()) {
    series.set(key, toWingSeries(group));
  }
  return series;
}

function toWingSeries(rows: RisingWingSalesInput[]): WingSeries {
  const sorted = [...rows]
    .filter((row) => row.salesLast28d != null)
    .sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  if (sorted.length === 0) return { latestSales: null, salesVelocityPerDay: null };
  const oldest = sorted[0];
  const latest = sorted[sorted.length - 1];
  const spanDays = Math.max(1, daysBetween(oldest.businessDate, latest.businessDate));
  const salesVelocityPerDay = sorted.length >= 2
    ? round2(((latest.salesLast28d ?? 0) - (oldest.salesLast28d ?? 0)) / spanDays)
    : null;
  return { latestSales: latest.salesLast28d, salesVelocityPerDay };
}

function indexTrends(rows: RisingTrendInput[]): Map<string, RisingTrendInput> {
  const byKeyword = new Map<string, RisingTrendInput>();
  for (const row of rows) {
    const key = normalizeText(row.keyword);
    if (!key) continue;
    const existing = byKeyword.get(key);
    // Prefer the row carrying the strongest positive trend signal.
    if (!existing || (row.trendDelta ?? -Infinity) > (existing.trendDelta ?? -Infinity)) {
      byKeyword.set(key, row);
    }
  }
  return byKeyword;
}

/** For a candidate's keyword, resolve the wing series keyed by product+keyword or product-only. */
function resolveWing(entry: ProductSeriesEntry, wingByProduct: Map<string, WingSeries>): WingSeries | null {
  if (entry.vendorItemId) {
    const byKeyword = wingByProduct.get(`${normalizeText(entry.keyword)}::vendor:${entry.vendorItemId}`);
    if (byKeyword) return byKeyword;
    const productOnly = wingByProduct.get(`vendor:${entry.vendorItemId}`);
    if (productOnly) return productOnly;
  }
  return null;
}

/** Distinct products competing on the same keyword's latest SERP (competition proxy). */
function keywordCompetitorCount(
  entry: ProductSeriesEntry,
  snapshots: RisingSerpSnapshotInput[],
): number {
  const keyword = normalizeText(entry.keyword);
  let latestDate = '';
  const distinct = new Set<string>();
  for (const snapshot of snapshots) {
    if (normalizeText(snapshot.keyword) !== keyword) continue;
    if (snapshot.businessDate > latestDate) {
      latestDate = snapshot.businessDate;
      distinct.clear();
      for (const item of snapshot.items) {
        const identity = productIdentity(item);
        if (identity) distinct.add(identity.key);
      }
    }
  }
  return distinct.size;
}

function buildStats(
  candidates: SourcingRisingProductCandidate[],
  snapshots: RisingSerpSnapshotInput[],
  insufficientHistoryCount: number,
): SourcingRisingProductModelResult['stats'] {
  const total = candidates.reduce((sum, candidate) => sum + candidate.score, 0);
  const keywordScore = new Map<string, number>();
  for (const candidate of candidates) {
    keywordScore.set(candidate.keyword, (keywordScore.get(candidate.keyword) ?? 0) + candidate.score);
  }
  return {
    candidateCount: candidates.length,
    serpSnapshotCount: snapshots.length,
    keywordCount: new Set(snapshots.map((s) => normalizeText(s.keyword)).filter(Boolean)).size,
    orderCount: candidates.filter((c) => c.decision === 'order').length,
    observeCount: candidates.filter((c) => c.decision === 'observe_3d').length,
    excludedCount: candidates.filter((c) => c.decision === 'exclude').length,
    withWingSalesCount: candidates.filter((c) => c.signals.hasWingSales).length,
    insufficientHistoryCount,
    averageScore: candidates.length === 0 ? 0 : Math.round(total / candidates.length),
    topKeyword: [...keywordScore.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  };
}

interface ProductIdentity {
  key: string;
  vendorItemId: string | null;
  productId: string | null;
}

function productIdentity(item: RisingSerpItemInput): ProductIdentity | null {
  const vendorItemId = stringValue(item.vendorItemId);
  const productId = stringValue(item.productId);
  const name = stringValue(item.name);
  const key = vendorItemId
    ? `vendor:${vendorItemId}`
    : productId
      ? `product:${productId}`
      : name
        ? `name:${normalizeText(name)}`
        : null;
  if (!key) return null;
  return { key, vendorItemId, productId };
}

function keywordVariants(keyword: string): string[] {
  const normalized = normalizeText(keyword);
  return normalized ? [normalized] : [];
}

function everOrganic(observations: ProductObservation[]): boolean {
  return observations.some((o) => o.everOrganic);
}

function latestNonNull(
  observations: ProductObservation[],
  key: 'name' | 'link',
): string | null {
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    const value = observations[index][key];
    if (value) return value;
  }
  return null;
}

function firstNonNullNumber(
  observations: ProductObservation[],
  key: 'reviewCount' | 'organicRank',
): number | null {
  for (const observation of observations) {
    const value = observation[key];
    if (value != null) return value;
  }
  return null;
}

function lastNonNullNumber(
  observations: ProductObservation[],
  key: 'reviewCount' | 'organicRank',
): number | null {
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    const value = observations[index][key];
    if (value != null) return value;
  }
  return null;
}

function minRank(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

function maxOrExisting(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

function daysBetween(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00.000Z`);
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.round((toMs - fromMs) / MS_PER_DAY);
}

function normalizeLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_CANDIDATE_LIMIT;
  return Math.max(1, Math.min(MAX_CANDIDATE_LIMIT, Math.floor(limit)));
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function intOrNull(value: unknown): number | null {
  const parsed = numberOrNull(value);
  return parsed == null ? null : Math.round(parsed);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
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
