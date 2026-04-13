import { z } from 'zod';

// ─── GET /api/ads — 상품별 광고 현황 ─────────────────────────────────────────

export const AdsListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
  company: z.string(),
  grade: z.string(),
  adTier: z.string().nullable(),
  spend: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  conversions: z.number(),
  adRevenue: z.number(),
  ctr: z.number(),
  convRate: z.number(),
  roas: z.number(),
  acos: z.number(),
  adRate: z.number(),
  revenue: z.number(),
  netProfit: z.number(),
  profitRate: z.number(),
  adBudgetLimit: z.number(),
  roasStatus: z.enum(['excellent', 'good', 'warning', 'poor']),
  adRateStatus: z.enum(['ok', 'warning', 'critical']),
  adRateOverLimit: z.boolean(),
});

export const AdsHubDataSchema = z.object({
  products: z.array(AdsListItemSchema),
  summary: z.object({
    totalSpend: z.number(),
    totalAdRevenue: z.number(),
    totalRevenue: z.number(),
    overallAdRate: z.number(),
    overallRoas: z.number(),
    highAdCount: z.number(),
    gradeSpend: z.record(z.number()),
    tierSpend: z.record(z.number()),
    gradeSpendPercent: z.record(z.number()),
    overallRoasStatus: z.enum(['excellent', 'good', 'warning', 'poor']),
    overallAdRateStatus: z.enum(['ok', 'warning', 'critical']),
  }),
});

export type AdsListItem = z.infer<typeof AdsListItemSchema>;
export type AdsHubData = z.infer<typeof AdsHubDataSchema>;
export type AdsSummary = AdsHubData['summary'];

// ─── Ad Campaign Snapshot ────────────────────────────────────────────────────

export const AdCampaignSnapshotSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  campaignName: z.string(),
  period: z.string(),
  date: z.string(),
  onOff: z.string().nullable(),
  status: z.string().nullable(),
  adSpend: z.number(),
  adRevenue: z.number(),
  totalRevenue: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  ctr: z.number().nullable(),
  conversions: z.number(),
  orders: z.number(),
  roas: z.number().nullable(),
  conversionRate: z.number().nullable(),
  budget: z.number().nullable(),
  todaySpend: z.number().nullable(),
  createdAt: z.string(),
});

export type AdCampaignSnapshot = z.infer<typeof AdCampaignSnapshotSchema>;

// ─── Ad Product Snapshot ─────────────────────────────────────────────────────

export const AdProductSnapshotSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  campaignName: z.string(),
  period: z.string(),
  date: z.string(),
  productName: z.string(),
  vendorItemId: z.string().nullable(),
  onOff: z.string().nullable(),
  status: z.string().nullable(),
  keyword: z.string().nullable(),
  adSpend: z.number(),
  adRevenue: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  ctr: z.number().nullable(),
  adConversions: z.number(),
  conversionRate: z.number().nullable(),
  createdAt: z.string(),
});

export type AdProductSnapshot = z.infer<typeof AdProductSnapshotSchema>;

// ─── GET /api/ads/benchmark — 업계 벤치마크 진단 ─────────────────────────────

export const AdBenchmarkDataSchema = z.object({
  myMetrics: z.object({
    roas: z.number(),
    ctr: z.number(),
    cvr: z.number(),
    cpc: z.number(),
    adRate: z.number(),
    acos: z.number(),
  }),
  industryBenchmark: z.record(z.object({
    avg: z.number(),
    good: z.number(),
    excellent: z.number(),
    poor: z.number(),
  })),
  comparisons: z.array(z.object({
    metric: z.string(),
    label: z.string(),
    myValue: z.number(),
    industryAvg: z.number(),
    industryGood: z.number(),
    industryExcellent: z.number(),
    industryPoor: z.number(),
    status: z.enum(['excellent', 'good', 'average', 'below', 'poor']),
    gap: z.number(),
    gapPercent: z.number(),
    strategy: z.string(),
    actions: z.array(z.string()),
  })),
  diagnosis: z.object({
    overallGrade: z.string(),
    overallMessage: z.string(),
    statusCounts: z.record(z.number()),
    priorityImprovements: z.array(z.object({
      metric: z.string(),
      label: z.string(),
      gap: z.number(),
      strategy: z.string(),
    })),
    strengths: z.array(z.object({
      metric: z.string(),
      label: z.string(),
      status: z.string(),
    })),
  }),
  dataInfo: z.object({
    period: z.string(),
    adRecords: z.number(),
    totalSpend: z.number(),
    totalAdRevenue: z.number(),
    totalRevenue: z.number(),
  }),
});

export type AdBenchmarkData = z.infer<typeof AdBenchmarkDataSchema>;

// ─── GET /api/ads/campaigns/trends — 트렌드 분석 ─────────────────────────────

export const AdTrendsDataSchema = z.object({
  daily: z.array(z.object({
    date: z.string(),
    label: z.string(),
    spend: z.number(),
    revenue: z.number(),
    roas: z.number(),
    clicks: z.number(),
    impressions: z.number(),
    conversions: z.number(),
    ctr: z.number(),
    cvr: z.number(),
  })),
  comparison: z.record(z.object({
    before: z.number(),
    after: z.number(),
    change: z.number(),
  })),
  budgetAllocation: z.array(z.object({
    grade: z.string(),
    spend: z.number(),
    revenue: z.number(),
    pct: z.number(),
    target: z.number(),
    roas: z.number(),
  })),
  days: z.number(),
});

export type AdTrendsData = z.infer<typeof AdTrendsDataSchema>;

// ─── GET /api/ads/strategy/plan — 주간 액션 플랜 ─────────────────────────────

export const AdStrategyPlanSchema = z.object({
  generatedAt: z.string(),
  totalProducts: z.number(),
  summary: z.object({
    scaleUp: z.number(),
    optimize: z.number(),
    reduce: z.number(),
    stop: z.number(),
    newStart: z.number(),
  }),
  budgetAllocation: z.array(z.object({
    grade: z.string(),
    currentPercent: z.number(),
    targetPercent: z.number(),
    gap: z.number(),
  })),
  keyMetrics: z.object({
    totalAdSpend: z.number(),
    totalAdRevenue: z.number(),
    overallRoas: z.number(),
  }),
});

export type AdStrategyPlan = z.infer<typeof AdStrategyPlanSchema>;

// ─── GET /api/ads/strategy/rules — 광고 규칙/추천 ────────────────────────────

export const AdRulesDataSchema = z.object({
  summary: z.record(z.number()),
  recommendations: z.array(z.object({
    productId: z.string(),
    name: z.string(),
    grade: z.string().nullable(),
    adTier: z.string().nullable(),
    spend: z.number(),
    revenue: z.number(),
    roas: z.number(),
    rule: z.string(),
    action: z.string(),
    priority: z.string(),
  })),
});

export type AdRulesData = z.infer<typeof AdRulesDataSchema>;

// ─── GET /api/ads/strategy/plan — 주간 액션 플랜 (확장) ────────────────────

export const AdStrategyActionSchema = z.object({
  productId: z.string(),
  name: z.string(),
  grade: z.string().nullable(),
  action: z.string(),
  reason: z.string(),
  spend: z.number(),
  roas: z.number(),
  profitRate: z.number(),
  // Dashboard UI 이식 — 전략 탭 ABC 카드 상세 필드
  tier: z.string().nullable().default(null),
  currentRoas: z.number().default(0),
  currentCtr: z.number().default(0),
  currentCvr: z.number().default(0),
  currentAcos: z.number().default(0),
  currentAdRate: z.number().default(0),
  recommendedAction: z.string().default(''),
  actionPriority: z.enum(['urgent', 'high', 'medium', 'low']).default('medium'),
  maxBidPrice: z.number().default(0),
  targetRoas: z.number().default(0),
  keywords: z.array(z.string()).default([]),
  // 광고 등록 플로우 연동 필드
  suggestedKeywords: z.object({
    main: z.array(z.string()),
    sub: z.array(z.string()),
    longtail: z.array(z.string()),
    negative: z.array(z.string()),
  }).default({ main: [], sub: [], longtail: [], negative: [] }),
  campaignStrategy: z.string().default(''),
  recommendedDailyBudget: z.number().default(0),
  isExisting: z.boolean().default(false),
});

export type AdStrategyAction = z.infer<typeof AdStrategyActionSchema>;

export const AdIssuesSchema = z.object({
  zeroConversion: z.number(),
  lowRoas: z.number(),
  cGradeHighTier: z.number(),
  aGradeNoAd: z.number(),
});

export type AdIssues = z.infer<typeof AdIssuesSchema>;

export const AdTierAnalysisSchema = z.object({
  tier: z.string(),
  count: z.number(),
  spend: z.number(),
  revenue: z.number(),
  roas: z.number(),
});

export type AdTierAnalysis = z.infer<typeof AdTierAnalysisSchema>;

export const AdTop20ItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  grade: z.string().nullable(),
  tier: z.string().nullable(),
  revenue: z.number(),
  adSpend: z.number(),
  roas: z.number(),
  profitRate: z.number(),
});

export type AdTop20Item = z.infer<typeof AdTop20ItemSchema>;

export const AdWeeklyPlanSchema = AdStrategyPlanSchema.extend({
  actions: z.array(AdStrategyActionSchema),
  adIssues: AdIssuesSchema,
  tierAnalysis: z.array(AdTierAnalysisSchema).optional(),
  top20: z.array(AdTop20ItemSchema).optional(),
});

export type AdWeeklyPlan = z.infer<typeof AdWeeklyPlanSchema>;

// ─── GET /api/ads/exposure-analysis — 쿠팡 상위노출 분석 ──────────────────────

export const ExposureFactorScoreSchema = z.object({
  score: z.number(),       // 0~100
  label: z.string(),
  color: z.string(),       // 'blue' | 'purple' | 'emerald' | 'amber' | 'slate'
  subMetric: z.string(),   // 핵심 서브메트릭 텍스트
  keyCount: z.number(),    // 핵심 카운트 (상품 수 등)
});

export const ExposureProductScoreSchema = z.object({
  productId: z.string(),
  name: z.string(),
  grade: z.string().nullable(),
  totalScore: z.number(),    // 0~100 종합 점수
  sales: z.number(),         // 판매실적 점수
  review: z.number(),        // 리뷰활성도 점수
  ad: z.number(),            // 광고효율 점수
  fulfillment: z.number(),   // 가격·출고 점수
  info: z.number(),          // 상품정보 점수
  topIssue: z.string(),      // 최우선 개선과제 텍스트
  topIssueFactor: z.string(), // 'sales' | 'review' | 'ad' | 'fulfillment' | 'info'
});

export const ExposureUrgentActionSchema = z.object({
  productId: z.string(),
  name: z.string(),
  grade: z.string().nullable(),
  factor: z.string(),
  factorLabel: z.string(),
  score: z.number(),
  action: z.string(),
  urgency: z.enum(['urgent', 'medium']),
});

export const ExposureAnalysisDataSchema = z.object({
  factorSummary: z.object({
    sales: ExposureFactorScoreSchema,
    review: ExposureFactorScoreSchema,
    ad: ExposureFactorScoreSchema,
    fulfillment: ExposureFactorScoreSchema,
    info: ExposureFactorScoreSchema,
  }),
  products: z.array(ExposureProductScoreSchema),
  urgentActions: z.array(ExposureUrgentActionSchema),
  totalProducts: z.number(),
});

export type ExposureFactorScore = z.infer<typeof ExposureFactorScoreSchema>;
export type ExposureProductScore = z.infer<typeof ExposureProductScoreSchema>;
export type ExposureUrgentAction = z.infer<typeof ExposureUrgentActionSchema>;
export type ExposureAnalysisData = z.infer<typeof ExposureAnalysisDataSchema>;
