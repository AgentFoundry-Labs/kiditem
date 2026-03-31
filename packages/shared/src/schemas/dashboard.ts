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
