import { z } from 'zod';
import { zIsoDate } from './common.js';
import { DashboardPeriodBasisSchema } from './dashboard.js';
import { FinanceWindowBasisSchema } from './profit-loss.js';

/**
 * Statistics domain response schemas.
 *
 * Backend `StatisticsService` return literals close with `satisfies <Xxx>`.
 * Every response carries the basis its values rest on. `basis` is `null` only
 * when no period was asked and no order was ever collected, so no window
 * exists to describe. A window total or ratio is `null` unless the whole
 * window was collected and its denominator is non-zero (ADR-0006).
 */

const StatisticsBasisSchema = FinanceWindowBasisSchema.nullable();

// ───── Overview ─────

export const StatisticsOverviewSchema = z.object({
  totalRevenue: z.number().int().nullable(),
  totalOrders: z.number().int().nullable(),
  totalProfit: z.number().int().nullable(),
  /** Profit over revenue as a ratio (0.4 = 40%). */
  avgMargin: z.number().nullable(),
  totalProducts: z.number().int(),
  basis: StatisticsBasisSchema,
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
  netProfit: z.number().int().nullable(),
  orderCount: z.number().int(),
  /** Ratio; `null` over zero revenue or an unavailable profit. */
  profitRate: z.number().nullable(),
  margin: z.number().nullable(),
});
export type StatisticsProductRow = z.infer<typeof StatisticsProductRowSchema>;

export const StatisticsProductsResponseSchema = z.object({
  rows: z.array(StatisticsProductRowSchema),
  basis: StatisticsBasisSchema,
});
export type StatisticsProductsResponse = z.infer<typeof StatisticsProductsResponseSchema>;

// ───── Categories ─────

export const StatisticsCategoryRowSchema = z.object({
  category: z.string(),
  name: z.string(),
  revenue: z.number().int(),
  orders: z.number().int(),
  profit: z.number().int().nullable(),
  count: z.number().int(),
});
export type StatisticsCategoryRow = z.infer<typeof StatisticsCategoryRowSchema>;

export const StatisticsCategoriesResponseSchema = z.object({
  rows: z.array(StatisticsCategoryRowSchema),
  basis: StatisticsBasisSchema,
});
export type StatisticsCategoriesResponse = z.infer<typeof StatisticsCategoriesResponseSchema>;

// ───── Grades ─────

export const StatisticsGradeRowSchema = z.object({
  grade: z.string(),
  revenue: z.number().int(),
  profit: z.number().int().nullable(),
  count: z.number().int(),
  productCount: z.number().int(),
  adCost: z.number().int().nullable(),
});
export type StatisticsGradeRow = z.infer<typeof StatisticsGradeRowSchema>;

export const StatisticsGradesResponseSchema = z.object({
  rows: z.array(StatisticsGradeRowSchema),
  basis: StatisticsBasisSchema,
});
export type StatisticsGradesResponse = z.infer<typeof StatisticsGradesResponseSchema>;

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
  /** `null` when the share it is cut from is unavailable. */
  paretoBand: StatisticsParetoBandSchema.nullable(),
  revenue: z.number().int(),
  revenuePercent: z.number().nullable(),
  cumulativePercent: z.number().nullable(),
});
export type StatisticsParetoItem = z.infer<typeof StatisticsParetoItemSchema>;

export const StatisticsParetoResponseSchema = z.object({
  totalRevenue: z.number().int().nullable(),
  bandDistribution: z.object({
    top70: z.number().int(),
    next20: z.number().int(),
    tail10: z.number().int(),
  }).nullable(),
  data: z.array(StatisticsParetoItemSchema),
  basis: StatisticsBasisSchema,
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
  totalCustomers: z.number().int().nullable(),
  repeatCount: z.number().int().nullable(),
  /** Ratio; `null` over no customers or an incompletely collected window. */
  repurchaseRate: z.number().nullable(),
  totalOrders: z.number().int().nullable(),
  repeatProducts: z.array(StatisticsRepurchaseProductSchema),
  repeatCustomers: z.array(StatisticsRepurchaseCustomerSchema),
  basis: z.object({ orders: DashboardPeriodBasisSchema }).strict().nullable(),
});
export type StatisticsRepurchaseResponse = z.infer<typeof StatisticsRepurchaseResponseSchema>;
