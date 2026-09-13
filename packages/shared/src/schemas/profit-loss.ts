import { z } from 'zod';
import { DashboardCalendarDateSchema, DashboardPeriodBasisSchema } from './dashboard.js';

export const FinancePeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM');

/**
 * P&L row — listingId-primary.
 *
 * Every cost is the sum of the listing's collected order lines. A line whose
 * purchase price, commission rate or other cost was never recorded makes that
 * cost `null`, and a profit built from an unavailable input is `null` too —
 * not a zero, and not a smaller profit (ADR-0006).
 */
export const PLDataSchema = z.object({
  listingId: z.string().uuid(),
  externalId: z.string(),
  channelName: z.string().nullable(),
  masterId: z.string().uuid(),
  masterCode: z.string(),
  masterName: z.string(),
  category: z.string().nullable(),
  grade: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  revenue: z.number().int(),
  cogs: z.number().int().nullable(),
  commission: z.number().int().nullable(),
  shippingCost: z.number().int(),
  adCost: z.number().int().nullable(),
  otherCost: z.number().int().nullable(),
  netProfit: z.number().int().nullable(),
  /** Percent with one decimal; `null` over zero revenue or an unavailable profit. */
  profitRate: z.number().nullable(),
  orderCount: z.number().int(),
  returnCount: z.number().int(),
});

export type PLData = z.infer<typeof PLDataSchema>;

/** An inclusive `YYYY-MM-DD` KST business-date range. */
export const FinanceDateRangeSchema = z.object({
  from: DashboardCalendarDateSchema,
  to: DashboardCalendarDateSchema,
}).strict();
export type FinanceDateRange = z.infer<typeof FinanceDateRangeSchema>;

/**
 * The evidence behind one finance window, as measured facts only.
 *
 * `requestedWindow` is the range asked for. Each value basis's `from`/`to` is
 * the window actually evaluated: the requested window clipped to the KST
 * business days already closed when it was read (ADR-0001). A month that has
 * ended keeps every day; the month containing today keeps the days through
 * yesterday; with no closed day yet the basis's `to` is the day before its
 * `from` and `targetDays` is 0.
 *
 * Within that window: which dates the Orders collection covered (`revenue`),
 * which the advertising sweep covered (`adCost`), and the dates on which every
 * profit input was measured (`profit`, whose `invalidDates` are the dates
 * refused because a cost input was never recorded). Status words are derived
 * with `periodBasisStatus` from `@kiditem/shared/dashboard`; none travels here.
 */
export const FinanceWindowBasisSchema = z.object({
  requestedWindow: FinanceDateRangeSchema,
  revenue: DashboardPeriodBasisSchema,
  adCost: DashboardPeriodBasisSchema,
  profit: DashboardPeriodBasisSchema,
}).strict();
export type FinanceWindowBasis = z.infer<typeof FinanceWindowBasisSchema>;

/**
 * Organization totals over the evaluated window. A total is published only when
 * every closed business date of the window was collected and every input it
 * depends on was measured; otherwise, and when no date has closed, it is `null`.
 */
export const FinanceWindowTotalsSchema = z.object({
  revenue: z.number().int().nullable(),
  orderCount: z.number().int().nonnegative().nullable(),
  /** Purchase cost + commission + other cost + order shipping + advertising. */
  cost: z.number().int().nullable(),
  adCost: z.number().int().nullable(),
  netProfit: z.number().int().nullable(),
  /** Percent with one decimal; `null` over zero revenue or an unavailable profit. */
  profitRate: z.number().nullable(),
}).strict();
export type FinanceWindowTotals = z.infer<typeof FinanceWindowTotalsSchema>;

/** `/api/profit-loss?period=YYYY-MM`. */
export const ProfitLossResponseSchema = z.object({
  period: FinancePeriodSchema,
  rows: z.array(PLDataSchema),
  totals: FinanceWindowTotalsSchema,
  basis: FinanceWindowBasisSchema,
});
export type ProfitLossResponse = z.infer<typeof ProfitLossResponseSchema>;
