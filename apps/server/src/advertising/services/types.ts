import type { Prisma } from '@prisma/client';
import type { AdMetrics, AdStrategyAction } from '@kiditem/shared';

// AdAction targetType 값 union (services/types.ts 전용 export, AdActionCommandDto 는 dto/).
export const AD_ACTION_TARGET_TYPES = ['campaign', 'keyword'] as const;
export type AdActionTargetType = typeof AD_ACTION_TARGET_TYPES[number];

// ChannelListing hydrate 공통 select 프리셋.
// 6 rewrite service 의 channelListing.findMany 는 이 프리셋을 재사용.
// Prisma relation 은 `master` (MasterProduct) — hydrate 시 shared AdListingSummary.masterProduct 로 remap.
export const LISTING_SUMMARY_SELECT = {
  id: true,
  externalId: true,
  channelName: true,
  master: { select: { id: true, code: true, name: true } },
} as const satisfies Prisma.ChannelListingSelect;

// Ads 설정 (DB SystemSetting `ads.*` key 로 저장).
export interface AdsConfig {
  roas: { thresholds: { excellent: number; warning: number; poor: number } };
  adRate: { thresholds: { warning: number; critical: number } };
  budget: { allocation: Record<string, number> };
  roasTargetByGrade: Record<string, number>;
  adRateTargetByGrade: Record<string, number>;
  tier: { dailyBudget: Record<string, number> };
  benchmark: {
    roas: { avg: number; good: number; excellent: number; poor: number };
    ctr: { avg: number; good: number; excellent: number; poor: number };
    cvr: { avg: number; good: number; excellent: number; poor: number };
    cpc: { avg: number; good: number; excellent: number; poor: number };
    adRate: { avg: number; good: number; excellent: number; poor: number };
    acos: { avg: number; good: number; excellent: number; poor: number };
  };
  gradeStrategy: Record<
    string,
    { title: string; subtitle: string; pills: string[]; budgetTarget: number; roasTarget: number; adRateTarget: number }
  >;
}

// Benchmark 비교 한 건.
export interface BenchmarkComparison {
  metric: string;
  label: string;
  myValue: number;
  industryAvg: number;
  industryGood: number;
  industryExcellent: number;
  industryPoor: number;
  status: 'excellent' | 'good' | 'average' | 'below' | 'poor';
  gap: number;
  gapPercent: number;
  strategy: string;
  actions: string[];
}

// 익스텐션 raw payload 에서 정규화된 캠페인 KPI.
export interface NormalizedCampaignKpi {
  adSpend: number;
  adRevenue: number;
  totalRevenue: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  orders: number;
  roas: number;
  conversionRate: number;
}

// Grade 별 예산 할당 (strategy 내부).
export interface GradeBudgetAllocation {
  grade: 'A' | 'B' | 'C';
  currentBudget: number;
  suggestedBudget: number;
  delta: number;
}

// Score 입력 (strategy calculate* 메서드용).
export interface ScoreInput {
  listingId: string;
  spend: number;
  revenue: number;
  orders: number;
  clicks: number;
  impressions: number;
  conversions: number;
  stock: number | null;
  grade: 'A' | 'B' | 'C' | null;
}

// listingId → 요약 lookup (sync / strategy 공통).
export interface ListingMetricsRow {
  listingId: string;
  metrics: AdMetrics;
}

// ───── Hydrated data shapes (orchestrator → sub-service input) ─────

export interface HydratedListing {
  id: string;
  externalId: string;
  channelName: string | null;
  masterProduct: {
    id: string;
    code: string;
    name: string;
    abcGrade: 'A' | 'B' | 'C' | null;
    adTier: string | null;
    healthScore: number | null;
  };
  /**
   * B2b rules 평가용 primary option metadata. calcActions 는 primary option 의
   * stock + cost/sell 로 margin / adBudgetLimit 를 계산 (원본 line 722-725).
   * 옵션이 없으면 null.
   */
  primaryOption: {
    id: string;
    availableStock: number | null;
    costPrice: number | null;
    sellPrice: number | null;
    commissionRate: Prisma.Decimal | number | null;
    shippingCost: number | null;
  } | null;
}

export interface InventoryRow {
  optionId: string;
  listingId: string;
  availableStock: number;
  costPrice: number | null;
  sellPrice: number | null;
  commissionRate: Prisma.Decimal | null;
}

export interface AdAggregateRow {
  listingId: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

/**
 * listingId 당 profitLoss 축약. B2b calcActions 는 `profitRate * 100` 을
 * action.proposedValue 로 환원 (원본 line 691).
 */
export interface ProfitLossRow {
  listingId: string;
  profitRate: number;
}

// ───── Sub-service input types ─────

export interface GradeRulesInput {
  adGroups: AdAggregateRow[];
  listings: HydratedListing[];
  gradeMap: Map<string, 'A' | 'B' | 'C' | null>;
  /** listingId → profitRate 백분율 (profitLoss.profitRate * 100). miss 시 0. */
  profitRateByListing: Map<string, number>;
}

export interface AdIssuesInput {
  adGroups: AdAggregateRow[];
  listings: HydratedListing[];
  gradeMap: Map<string, 'A' | 'B' | 'C' | null>;
}

export interface KeyMetricsInput {
  snapshots: Array<{ listingId: string | null; spend: number; revenue: number; clicks: number; impressions: number; conversions: number }>;
  listings: HydratedListing[];
}

export interface KeyMetricsResult {
  totals: { spend: number; revenue: number; clicks: number; impressions: number; conversions: number };
  perListing: Map<string, ListingMetricsRow>;
  gradeMap: Map<string, 'A' | 'B' | 'C'>;
}

export interface BudgetAllocatorInput {
  config: AdsConfig;
  adGroups: AdAggregateRow[];
  listings: HydratedListing[];
  gradeMap: Map<string, 'A' | 'B' | 'C'>;
}

export interface TierAnalysisInput {
  listings: HydratedListing[];
  adGroups: AdAggregateRow[];
}

export interface Top20Input {
  profitLosses: Array<{ listingId: string | null; profit: number | null; profitRate: Prisma.Decimal | null }>;
  listings: HydratedListing[];
  adGroups: AdAggregateRow[];
}

export interface ExposureScoreInput {
  listing: HydratedListing;
  metrics: ListingMetricsRow;
  inventory: InventoryRow | null;
  reviewStats: { totalReviews: number; recentReviews: number; avgRating: number } | null;
  // 기존 ad-strategy.service.ts:1218-1306 공식 보존용 추가 컨텍스트.
  // orchestrator (T7) 가 trafficStats / inventory.leadTimeDays / option pricing 으로 사전 계산.
  // null/0 default 로 호출하면 formula 가 baseline (low) score 로 degrade.
  trafficContext: { maxT14: number; t14Rev: number; t14PrevRev: number; t14Orders: number };
  fulfillmentContext: { leadTime: number | null; profitRate: number };
}

export interface TopIssueInput {
  listing: HydratedListing;
  scores: { sales: number; review: number; ad: number; fulfillment: number; info: number };
}

export type RecommendInput = AdStrategyAction[];
