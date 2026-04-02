import { z } from 'zod';

// GET /api/ads 응답의 각 item + GET /api/ads/hub의 products 각 item
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

// GET /api/ads/hub 응답
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

// ─── Ad Campaign Snapshot ─────────────────────────────────────────────────────

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

// ─── Ad Product Snapshot ──────────────────────────────────────────────────────

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

// ─── Ad Benchmark Data ────────────────────────────────────────────────────────

export const AdBenchmarkDataSchema = z.object({
  metrics: z.array(z.object({
    name: z.string(),
    label: z.string(),
    myValue: z.number(),
    industryAvg: z.number(),
    unit: z.string(),
    status: z.enum(['excellent', 'good', 'average', 'below', 'poor']),
  })),
  overallGrade: z.string(),
  priorityActions: z.array(z.string()),
});

export type AdBenchmarkData = z.infer<typeof AdBenchmarkDataSchema>;

// ─── Ad Trends Data ───────────────────────────────────────────────────────────

export const AdTrendsDataSchema = z.object({
  labels: z.array(z.string()),
  datasets: z.object({
    adSpend: z.array(z.number()),
    adRevenue: z.array(z.number()),
    roas: z.array(z.number()),
  }),
});

export type AdTrendsData = z.infer<typeof AdTrendsDataSchema>;

// ─── Ad Strategy Plan ─────────────────────────────────────────────────────────

export const AdStrategyPlanSchema = z.object({
  grade: z.string(),
  title: z.string(),
  description: z.string(),
  actions: z.array(z.object({
    action: z.string(),
    priority: z.enum(['urgent', 'high', 'medium', 'low']),
  })),
});

export type AdStrategyPlan = z.infer<typeof AdStrategyPlanSchema>;

// ─── Ad Rules Data ────────────────────────────────────────────────────────────

export const AdRulesDataSchema = z.object({
  rules: z.array(z.object({
    id: z.string(),
    name: z.string(),
    condition: z.string(),
    grade: z.string(),
    priority: z.enum(['urgent', 'high', 'medium', 'low']),
    action: z.string(),
  })),
});

export type AdRulesData = z.infer<typeof AdRulesDataSchema>;
