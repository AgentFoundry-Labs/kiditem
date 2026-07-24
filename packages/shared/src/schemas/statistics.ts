import { z } from 'zod';
import { zIsoDate } from './common.js';

/**
 * Statistics domain response schemas — Plan B2c.orders T10.
 *
 * Backend `StatisticsService` 의 7 메서드 (overview / products / categories / grades /
 * pareto / repurchase / delivery) return literal 에 `satisfies <Xxx>` 바인딩.
 * ProfitLoss.listing.master 기반 listingId-primary shape (3-layer product schema + channel-agnostic Order).
 */

// ───── Overview ─────

export const StatisticsOverviewSchema = z.object({
  totalRevenue: z.number().int(),
  totalOrders: z.number().int(),
  totalProfit: z.number().int(),
  avgMargin: z.number(),
  totalProducts: z.number().int(),
});
export type StatisticsOverview = z.infer<typeof StatisticsOverviewSchema>;

// ───── Products ─────

export const StatisticsProductRowSchema = z.object({
  listingId: z.string().uuid(),
  externalId: z.string(),
  channelName: z.string().nullable(),
  masterId: z.string().uuid(),
  masterCode: z.string(),
  productName: z.string(),
  category: z.string().nullable(),
  grade: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  totalRevenue: z.number().int(),
  netProfit: z.number().int(),
  orderCount: z.number().int(),
  profitRate: z.number(),
  margin: z.number(),
});
export type StatisticsProductRow = z.infer<typeof StatisticsProductRowSchema>;

// ───── Categories ─────

export const StatisticsCategoryRowSchema = z.object({
  category: z.string(),
  name: z.string(),
  revenue: z.number().int(),
  orders: z.number().int(),
  profit: z.number().int(),
  count: z.number().int(),
});
export type StatisticsCategoryRow = z.infer<typeof StatisticsCategoryRowSchema>;

// ───── Grades ─────

export const StatisticsGradeRowSchema = z.object({
  grade: z.string(),
  revenue: z.number().int(),
  profit: z.number().int(),
  count: z.number().int(),
  productCount: z.number().int(),
  adCost: z.number().int(),
});
export type StatisticsGradeRow = z.infer<typeof StatisticsGradeRowSchema>;

// ───── Pareto ─────

export const StatisticsParetoBandSchema = z.enum([
  'top70',
  'next20',
  'tail10',
]);

export const StatisticsParetoItemSchema = z.object({
  id: z.string().uuid(),
  rank: z.number().int(),
  name: z.string(),
  paretoBand: StatisticsParetoBandSchema,
  revenue: z.number().int(),
  revenuePercent: z.number(),
  cumulativePercent: z.number(),
});
export type StatisticsParetoItem = z.infer<typeof StatisticsParetoItemSchema>;

export const StatisticsParetoResponseSchema = z.object({
  totalRevenue: z.number().int(),
  bandDistribution: z.object({
    top70: z.number().int(),
    next20: z.number().int(),
    tail10: z.number().int(),
  }),
  data: z.array(StatisticsParetoItemSchema),
});
export type StatisticsParetoResponse = z.infer<typeof StatisticsParetoResponseSchema>;

// ───── Repurchase ─────

export const StatisticsRepurchaseProductSchema = z.object({
  masterId: z.string().uuid(),
  productName: z.string(),
  category: z.string().nullable(),
  orderCount: z.number().int(),
});
export type StatisticsRepurchaseProduct = z.infer<typeof StatisticsRepurchaseProductSchema>;

export const StatisticsRepurchaseCustomerSchema = z.object({
  name: z.string(),
  count: z.number().int(),
  totalAmount: z.number().int(),
  lastOrder: zIsoDate.nullable(),
});
export type StatisticsRepurchaseCustomer = z.infer<typeof StatisticsRepurchaseCustomerSchema>;

export const StatisticsRepurchaseResponseSchema = z.object({
  totalCustomers: z.number().int(),
  repeatCount: z.number().int(),
  repurchaseRate: z.number(),
  totalOrders: z.number().int(),
  repeatProducts: z.array(StatisticsRepurchaseProductSchema),
  repeatCustomers: z.array(StatisticsRepurchaseCustomerSchema),
});
export type StatisticsRepurchaseResponse = z.infer<typeof StatisticsRepurchaseResponseSchema>;

// ───── Delivery ─────

export const StatisticsDeliveryDailySchema = z.object({
  date: z.string(),
  count: z.number().int(),
  orders: z.number().int(),
  revenue: z.number().int(),
  qty: z.number().int(),
});
export type StatisticsDeliveryDaily = z.infer<typeof StatisticsDeliveryDailySchema>;

export const StatisticsDeliveryResponseSchema = z.object({
  totalShipments: z.number().int(),
  avgDeliveryDays: z.number(),
  courierDistribution: z.array(
    z.object({ courier: z.string(), count: z.number().int() }),
  ),
  daily: z.array(StatisticsDeliveryDailySchema),
});
export type StatisticsDeliveryResponse = z.infer<typeof StatisticsDeliveryResponseSchema>;
