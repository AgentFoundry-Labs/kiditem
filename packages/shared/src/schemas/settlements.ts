import { z } from 'zod';
import { zIsoDate } from './common.js';
import { FinanceWindowBasisSchema } from './profit-loss.js';

/**
 * Settlement ledger row as the screen reads it. The stored actual amount
 * defaults to 0 before anyone confirms a deposit, so an unconfirmed
 * settlement publishes `actualAmount` and `difference` as `null`.
 */
export const SettlementListItemSchema = z.object({
  id: z.string().uuid(),
  period: z.string(),
  expectedAmount: z.number().int(),
  actualAmount: z.number().int().nullable(),
  commission: z.number().int(),
  shippingFee: z.number().int(),
  adjustments: z.number().int(),
  /** Confirmed actual amount minus expected amount. */
  difference: z.number().int().nullable(),
  orderCount: z.number().int(),
  returnCount: z.number().int(),
  status: z.string(),
  settledAt: zIsoDate.nullable(),
  notes: z.string().nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type SettlementListItem = z.infer<typeof SettlementListItemSchema>;

/**
 * Settlements reconcile response.
 *
 * Backend `SettlementsService.reconcile()` return literal closes with
 * `satisfies SettlementReconcileResponse`. Summary totals are `null` unless the
 * Orders collection covered the whole month; a match rate over no products is
 * `null`.
 */
export const SettlementReconcileDetailSchema = z.object({
  listingId: z.string().uuid(),
  externalId: z.string(),
  channelName: z.string().nullable(),
  masterCode: z.string(),
  masterName: z.string(),
  plRevenue: z.number().int(),
  plCommission: z.number().int().nullable(),
  plNetProfit: z.number().int().nullable(),
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
    totalPlRevenue: z.number().int().nullable(),
    totalOrderRevenue: z.number().int().nullable(),
    totalCommission: z.number().int().nullable(),
    totalShipping: z.number().int().nullable(),
    revenueDifference: z.number().int().nullable(),
    productCount: z.number().int(),
    orderCount: z.number().int().nullable(),
    matchedCount: z.number().int(),
    mismatchCount: z.number().int(),
    matchRate: z.number().int().nullable(),
  }),
  details: z.array(SettlementReconcileDetailSchema),
  basis: FinanceWindowBasisSchema,
});
export type SettlementReconcileResponse = z.infer<typeof SettlementReconcileResponseSchema>;
