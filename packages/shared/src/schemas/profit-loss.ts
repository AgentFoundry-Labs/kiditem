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
 * How one cost component stands on the collected order lines of the evaluated
 * window, as counts: `notAppliedLines` do not carry the component, so it is 0
 * by rule (Not applied); `unmeasuredLines` carry it but nobody measured it
 * (Not measured); every other line was measured. The word is derived with
 * `financeCostInputState`; none travels here.
 */
export const FinanceCostInputBasisSchema = z.object({
  lines: z.number().int().nonnegative(),
  notAppliedLines: z.number().int().nonnegative(),
  unmeasuredLines: z.number().int().nonnegative(),
}).strict();
export type FinanceCostInputBasis = z.infer<typeof FinanceCostInputBasisSchema>;

/**
 * The cost components of a finance profit (KID-114): purchase cost (recipe ×
 * Sellpia purchase price), the sales commission and other per-sale cost
 * (decided by the order's channel account), and advertising (decided by
 * whether the Coupang target-day sweep covers the listing's account).
 *
 * Each component counts the collected lines sold under a listing option: the
 * lines a product row carries. `unmappedLines` counts the lines sold under
 * none; they have no product row and no recipe, enter revenue only, and leave
 * the window's cost and profit unavailable.
 */
export const FinanceCostInputsBasisSchema = z.object({
  unmappedLines: z.number().int().nonnegative(),
  purchaseCost: FinanceCostInputBasisSchema,
  commission: FinanceCostInputBasisSchema,
  otherCost: FinanceCostInputBasisSchema,
  advertising: FinanceCostInputBasisSchema,
}).strict();
export type FinanceCostInputsBasis = z.infer<typeof FinanceCostInputsBasisSchema>;

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
 * refused because a cost input was never recorded), and per cost component the
 * lines it does not apply to and the lines nobody measured (`costInputs`).
 * Status words are derived with `periodBasisStatus` from
 * `@kiditem/shared/dashboard` and `financeCostInputState`; none travels here.
 */
export const FinanceWindowBasisSchema = z.object({
  requestedWindow: FinanceDateRangeSchema,
  revenue: DashboardPeriodBasisSchema,
  adCost: DashboardPeriodBasisSchema,
  profit: DashboardPeriodBasisSchema,
  costInputs: FinanceCostInputsBasisSchema,
}).strict();
export type FinanceWindowBasis = z.infer<typeof FinanceWindowBasisSchema>;

/**
 * Organization totals over the evaluated window. A total is published only when
 * every closed business date of the window was collected and every input it
 * depends on was measured; otherwise, and when no date has closed, it is `null`.
 *
 * The totals are not the sum of the product rows. Each part no row carries is
 * published by its cause, so a screen shows it rather than subtracting:
 *
 * - `unallocatedAdCost`: listing-grain spend on listings that sold nothing in
 *   the window, so no row exists for it.
 * - `adCostGrainDifference`: `adCost` is each account's campaign-grain spend
 *   (product-grain where no campaign row exists) while rows carry listing-grain
 *   spend; the difference between the grains belongs to no row and may be
 *   negative.
 * - `unallocatedShipping`: the shipping of orders with no revenue to weigh it
 *   by, and the revenue share of lines sold under no listing option.
 *
 * Each part is rounded once from exact values. Whatever else separates the
 * rows from the total is rounding — every row rounds its own sums, and
 * shipping is rounded per line, up to a won per order — and is never published
 * as a part.
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
  /** Ad cost as a percent of revenue with one decimal; `null` over zero revenue or an unavailable ad cost. */
  adCostRate: z.number().nullable(),
  /** Listing-grain spend on listings with no product row; `null` when `adCost` is unavailable. */
  unallocatedAdCost: z.number().int().nullable(),
  /** Campaign-grain `adCost` minus listing-grain spend over every listing; `null` when `adCost` is unavailable. */
  adCostGrainDifference: z.number().int().nullable(),
  /** Shipping no line revenue can weigh onto a row; `null` when revenue is unavailable. */
  unallocatedShipping: z.number().int().nullable(),
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
