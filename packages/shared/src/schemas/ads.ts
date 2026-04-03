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
    label: z.string(),
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
