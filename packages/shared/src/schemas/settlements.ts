import { z } from 'zod';

/**
 * Settlements reconcile response — Plan B2c.orders T10.
 *
 * Backend `SettlementsService.reconcile()` return literal 에 `satisfies SettlementReconcileResponse`.
 * listingId-primary + $queryRaw aggregation (`oli.total_price ::bigint` → `Number()`).
 * ADR-0013 3-layer + ADR-0015 channel-agnostic Order.
 */

export const SettlementReconcileDetailSchema = z.object({
  listingId: z.string().uuid(),
  externalId: z.string(),
  channelName: z.string().nullable(),
  masterCode: z.string(),
  masterName: z.string(),
  plRevenue: z.number().int(),
  plCommission: z.number().int(),
  plNetProfit: z.number().int(),
  plOrderCount: z.number().int(),
  orderTotal: z.number().int(),
  orderCount: z.number().int(),
  revenueDiff: z.number().int(),
  isMatched: z.boolean(),
  status: z.enum(['matched', 'minor_diff', 'mismatch']),
});
export type SettlementReconcileDetail = z.infer<typeof SettlementReconcileDetailSchema>;

export const SettlementReconcileResponseSchema = z.object({
  success: z.boolean(),
  period: z.string(),
  summary: z.object({
    totalPlRevenue: z.number().int(),
    totalOrderRevenue: z.number().int(),
    totalCommission: z.number().int(),
    totalShipping: z.number().int(),
    revenueDifference: z.number().int(),
    productCount: z.number().int(),
    orderCount: z.number().int(),
    matchedCount: z.number().int(),
    mismatchCount: z.number().int(),
    matchRate: z.number().int(),
  }),
  details: z.array(SettlementReconcileDetailSchema),
});
export type SettlementReconcileResponse = z.infer<typeof SettlementReconcileResponseSchema>;
