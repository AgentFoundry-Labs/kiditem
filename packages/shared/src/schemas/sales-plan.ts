import { z } from 'zod';
import { zIsoDate } from './common.js';
import { FinanceWindowBasisSchema } from './profit-loss.js';

/**
 * A sales plan's targets beside the month's actuals, read live from the
 * collected order lines. Actuals are never stored: they carry the observation
 * time and basis of the reads behind them, and a month that was not collected
 * publishes `null` rather than a stored default.
 */
export const SalesPlanActualsSchema = z.object({
  revenue: z.number().int().nullable(),
  orderCount: z.number().int().nonnegative().nullable(),
  netProfit: z.number().int().nullable(),
  observedAt: zIsoDate.nullable(),
  basis: FinanceWindowBasisSchema,
}).strict();
export type SalesPlanActuals = z.infer<typeof SalesPlanActualsSchema>;

/**
 * Percent of each target the actuals reached, rounded to an integer. `null`
 * over a zero target or an actual that is unavailable; the screen renders the
 * rate as published.
 */
export const SalesPlanAchievementSchema = z.object({
  revenue: z.number().int().nullable(),
  orders: z.number().int().nullable(),
  profit: z.number().int().nullable(),
}).strict();
export type SalesPlanAchievement = z.infer<typeof SalesPlanAchievementSchema>;

export const SalesPlanViewSchema = z.object({
  id: z.string().uuid(),
  period: z.string(),
  targetRevenue: z.number().int(),
  targetOrders: z.number().int(),
  targetProfit: z.number().int(),
  notes: z.string().nullable(),
  /** `null` when the stored period is not a `YYYY-MM` month. */
  actuals: SalesPlanActualsSchema.nullable(),
  achievement: SalesPlanAchievementSchema,
}).strict();
export type SalesPlanView = z.infer<typeof SalesPlanViewSchema>;
