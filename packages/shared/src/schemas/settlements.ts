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
