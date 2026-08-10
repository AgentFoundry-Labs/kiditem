import { recommendationItemKey } from './sourcing-recommendation-identity';

export const SOURCING_RECOMMENDATION_POLICY_KEY = 'sourcing_workspace' as const;
export const SOURCING_RECOMMENDATION_POLICY_VERSION = '2026-08-10';
export const SOURCING_RECOMMENDATION_MODEL_VERSION = 'server-owned-v1';
export const SOURCING_RECOMMENDATION_CALCULATION_VERSION = '2026-08-10';

export interface CoupangRecommendationObservation {
  evidenceObservationId: string;
  productId: string;
  itemId: string | null;
  vendorItemId: string | null;
  productName: string;
  sourceKeyword: string;
  salePriceKrw: number | null;
  ratingCount: number | null;
  ratingAverage: number | null;
  viewsLast28d: number | null;
  salesLast28d: number | null;
  capturedAt: Date;
}

export interface CoupangRecommendation {
  itemKey: string;
  externalOfferId: string;
  variantKeyNormalized: string;
  displayName: string;
  rank: number;
  score: number;
  grade: 'A' | 'B' | 'C' | 'WATCH';
  baselineAction: 'order' | 'observe_3d' | 'exclude';
  reasonCodes: string[];
  riskCodes: string[];
  scoreComponents: Record<string, number>;
  sourceSnapshot: Record<string, unknown>;
  evidenceObservationIds: string[];
}

/**
 * The former browser-side Today ranking, deliberately narrowed to a pure
 * function. Persistence, browser storage, and event dispatch stay outside the
 * policy so every surface receives the same score.
 */
export function buildCoupangRecommendations(
  observations: CoupangRecommendationObservation[],
): CoupangRecommendation[] {
  return observations
    .map((observation) => toCoupangRecommendation(observation))
    .sort((left, right) => right.score - left.score || left.displayName.localeCompare(right.displayName))
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export function baselineActionForScore(
  score: number,
): 'order' | 'observe_3d' | 'exclude' {
  if (score >= 75) return 'order';
  if (score >= 45) return 'observe_3d';
  return 'exclude';
}

export function gradeForScore(score: number): 'A' | 'B' | 'C' | 'WATCH' {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'WATCH';
}

function toCoupangRecommendation(observation: CoupangRecommendationObservation): CoupangRecommendation {
  const variantKeyNormalized = observation.vendorItemId?.trim() ?? observation.itemId?.trim() ?? '';
  const scoreComponents = {
    sales: clamp(logScore(observation.salesLast28d, 100)),
    views: clamp(logScore(observation.viewsLast28d, 1_000)),
    rating: clamp(((observation.ratingAverage ?? 0) / 5) * 100),
    reviews: clamp(logScore(observation.ratingCount, 500)),
  };
  const score = Math.round(
    scoreComponents.sales * 0.4 +
      scoreComponents.views * 0.25 +
      scoreComponents.rating * 0.2 +
      scoreComponents.reviews * 0.15,
  );
  const reasonCodes: string[] = [];
  const riskCodes: string[] = [];
  if ((observation.salesLast28d ?? 0) > 0) reasonCodes.push('coupang_sales_observed');
  if ((observation.viewsLast28d ?? 0) > 0) reasonCodes.push('coupang_demand_observed');
  if ((observation.ratingAverage ?? 0) >= 4) reasonCodes.push('coupang_rating_positive');
  if (reasonCodes.length === 0) riskCodes.push('coupang_demand_metrics_missing');
  if (observation.salePriceKrw == null) riskCodes.push('coupang_sale_price_missing');

  return {
    itemKey: recommendationItemKey({
      sourcePlatform: 'coupang',
      externalOfferId: observation.productId,
      variantKey: variantKeyNormalized,
      matchedCoupangProductId: observation.productId,
    }),
    externalOfferId: observation.productId,
    variantKeyNormalized,
    displayName: observation.productName,
    rank: 0,
    score,
    grade: gradeForScore(score),
    baselineAction: baselineActionForScore(score),
    reasonCodes,
    riskCodes,
    scoreComponents,
    sourceSnapshot: {
      keyword: observation.sourceKeyword,
      productId: observation.productId,
      itemId: observation.itemId,
      vendorItemId: observation.vendorItemId,
      productName: observation.productName,
      salePriceKrw: observation.salePriceKrw,
      ratingCount: observation.ratingCount,
      ratingAverage: observation.ratingAverage,
      viewsLast28d: observation.viewsLast28d,
      salesLast28d: observation.salesLast28d,
      capturedAt: observation.capturedAt.toISOString(),
    },
    evidenceObservationIds: [observation.evidenceObservationId],
  };
}

function logScore(value: number | null, cap: number): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return (Math.log10(value + 1) / Math.log10(cap + 1)) * 100;
}

function clamp(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}
