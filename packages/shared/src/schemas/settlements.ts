import { z } from 'zod';
import { zIsoDate } from './common.js';

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
 * The settlement card totals, summed on the server over the listed rows: the
 * expected amount of every row, and the deposit and difference of the
 * confirmed rows only — an unconfirmed deposit is not a deposit of zero.
 */
export const SettlementListSummarySchema = z.object({
  totalExpected: z.number().int(),
  totalConfirmedActual: z.number().int(),
  totalConfirmedDifference: z.number().int(),
  pendingCount: z.number().int().nonnegative(),
}).strict();
export type SettlementListSummary = z.infer<typeof SettlementListSummarySchema>;

/** `GET /api/settlements`: the rows and the totals the cards show. */
export const SettlementListResponseSchema = z.object({
  items: z.array(SettlementListItemSchema),
  summary: SettlementListSummarySchema,
}).strict();
export type SettlementListResponse = z.infer<typeof SettlementListResponseSchema>;
