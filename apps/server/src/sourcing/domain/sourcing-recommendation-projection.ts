/**
 * Stable server-side projection consumed by future AgentOS discovery and
 * decision workflows. The values are mapped from an immutable
 * SourcingRecommendationRun; this module deliberately contains no scorer and
 * no workspace-snapshot reader.
 */
export const SOURCING_RECOMMENDATION_PROJECTION_VERSION = 1;
export const SOURCING_RECOMMENDATION_PROJECTION_PIPELINE = 'normalized_recommendation_replay';
export const SOURCING_RECOMMENDATION_PROJECTION_GENERATOR_VERSION = 'sourcing-recommendation.run.v1';

export type SourcingRecommendationProjectionGrade = 'A' | 'B' | 'C' | 'WATCH';
export type SourcingRecommendationProjectionBaselineAction = 'order' | 'observe_3d' | 'exclude';
export type SourcingRecommendationProjectionMatchMethod = 'image' | 'keyword' | 'fuzzy';

export interface SourcingRecommendationProjectionCoupangCandidate {
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
  grade: SourcingRecommendationProjectionGrade;
  decision: 'recommend' | 'watch' | 'exclude';
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

export interface SourcingRecommendationProjectionSupplierCandidate {
  id: string;
  rank: number;
  offerId: string | null;
  title: string;
  imageUrl: string | null;
  sourceUrl: string;
  keyword: string | null;
  matchMethod: SourcingRecommendationProjectionMatchMethod;
  score: number;
  grade: SourcingRecommendationProjectionGrade;
  decision: SourcingRecommendationProjectionBaselineAction;
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
