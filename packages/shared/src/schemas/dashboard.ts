import { z } from 'zod';

// GET /api/dashboard 응답
export const DashboardSummarySchema = z.object({
  summary: z.object({
    todayRevenue: z.number(),
    todayOrders: z.number(),
    monthlyRevenue: z.number(),
    monthlyProfit: z.number(),
    adRate: z.number(),
    totalProducts: z.number(),
    roas: z.number(),
    ctr: z.number(),
    adRevenue: z.number(),
    totalAdSpend: z.number(),
    prevMonthlyRevenue: z.number(),
    prevMonthlyProfit: z.number(),
    prevRoas: z.number(),
    prevCtr: z.number(),
    prevAdRevenue: z.number(),
    prevTotalAdSpend: z.number(),
    prevAdRate: z.number(),
  }),
  gradeCount: z.record(z.number()),
  alerts: z.array(z.any()),
  warnings: z.object({
    minusProducts: z.number(),
    lowProfitProducts: z.number(),
    highAdProducts: z.number(),
    needReorder: z.number(),
  }),
  topProducts: z.array(z.object({
    id: z.string(),
    name: z.string(),
    company: z.string(),
    grade: z.string(),
    revenue: z.number(),
    netProfit: z.number(),
    profitRate: z.number(),
  })),
  monthlyTrend: z.array(z.object({
    period: z.string(),
    revenue: z.number(),
    profit: z.number(),
    adCost: z.number(),
  })),
  profitDetail: z.object({
    revenue: z.number(),
    costOfGoods: z.number(),
    commission: z.number(),
    shippingCost: z.number(),
    adCost: z.number(),
    otherCost: z.number(),
    netProfit: z.number(),
    orderCount: z.number(),
  }).optional(),
  rangeKpi: z.object({
    range: z.string(),
    revenue: z.number(),
    profit: z.number(),
    adSpend: z.number(),
    prevRevenue: z.number(),
    prevProfit: z.number(),
    revenueChange: z.number(),
    profitChange: z.number(),
    adRoas: z.number(),
    adConvRevenue: z.number(),
  }).optional(),
  trafficKpi: z.object({
    visitors: z.number(),
    views: z.number(),
    orders: z.number(),
    salesQty: z.number(),
    revenue: z.number(),
    cartAdds: z.number(),
  }).optional(),
  adKpi: z.object({
    totalSpend: z.number(),
    impressions: z.number(),
    clicks: z.number(),
    convRevenue: z.number(),
    ctr: z.number(),
    roas: z.number(),
  }).optional(),
  comparison: z.object({
    prevRevenue: z.number(),
    prevProfit: z.number(),
    revenueChange: z.number(),
    profitChange: z.number(),
  }).optional(),
  dailyTrend: z.array(z.object({
    date: z.string(),
    revenue: z.number(),
    adCost: z.number(),
  })).optional(),
  planAchievement: z.object({
    targetRevenue: z.number(),
    actualRevenue: z.number(),
    targetOrders: z.number(),
    actualOrders: z.number(),
    achieveRate: z.number(),
  }).nullable().optional(),
  gradeChanges: z.object({
    upgraded: z.number(),
    downgraded: z.number(),
    total: z.number(),
  }).optional(),
  industryBenchmark: z.object({
    avgAdRate: z.number(),
    avgProfitRate: z.number(),
    avgRoas: z.number(),
    avgCtr: z.number(),
  }).optional(),
  dataFreshness: z.object({
    lastSync: z.string(),
    attributionWindow: z.string(),
  }).optional(),
});

// GET /api/dashboard/trend 응답
export const DashboardTrendItemSchema = z.object({
  date: z.string(),
  revenue: z.number(),
  profit: z.number(),
  adCost: z.number(),
});

export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
export type DashboardTrendItem = z.infer<typeof DashboardTrendItemSchema>;
