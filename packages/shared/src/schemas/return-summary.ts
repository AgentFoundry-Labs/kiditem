import { z } from 'zod';

/**
 * `/api/coupang-dashboard/return-summary` response.
 *
 * `orderCount` counts the window's collected orders. Returns have no owner
 * publication, so `returnCount`, `returnRate` and `orphanReturnCount` are `null`
 * (not collected), never zero (ADR-0006). A measured rate is returns of orders
 * placed in the window over those orders, bounded [0, 1]; returns without an
 * order count only toward `orphanReturnCount`.
 */
export const ReturnSummarySchema = z.object({
  orderCount: z.number().int().nonnegative(),
  returnCount: z.number().int().nonnegative().nullable(),
  returnRate: z.number().min(0).max(1).nullable(),
  orphanReturnCount: z.number().int().nonnegative().nullable(),
});
export type ReturnSummary = z.infer<typeof ReturnSummarySchema>;
