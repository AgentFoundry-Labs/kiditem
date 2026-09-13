import { z } from 'zod';
import { FinancePeriodSchema, FinanceWindowBasisSchema } from './profit-loss.js';

/**
 * `/api/sales-analysis` channel row — 채널(플랫폼)별 매출/비용/이익 요약.
 *
 * Semantic:
 * - Group key: `ChannelListing.channel` (e.g., 'coupang', 'naver', 'wing')
 *   NOT `channelName` (listing display title).
 * - channelType: derived server-side from channel ('marketplace' | 'direct' | 'other').
 * - totalCost / totalProfit / profitRate: `null` when any line of the channel
 *   lacks a recorded cost, or when advertising applies and the sweep did not
 *   measure the whole window. Unmeasured advertising is never added as 0.
 * - returnCount / returnRate / totals.orphanReturnCount: `null` while returns
 *   have no owner publication; nothing collects them, so no return table is a
 *   count (ADR-0006). A measured rate is distinct returned orders / orders in
 *   period, bounded [0, 1]; returns without an order belong only to `totals`.
 */
export const ChannelAnalysisSchema = z.object({
  channel: z.string(),
  channelType: z.enum(['marketplace', 'direct', 'other']),
  totalOrders: z.number().int().nonnegative(),
  totalRevenue: z.number().int().nonnegative(),
  totalCost: z.number().int().nonnegative().nullable(),
  totalProfit: z.number().int().nullable(),
  /** Percent with one decimal. */
  profitRate: z.number().nullable(),
  returnCount: z.number().int().nonnegative().nullable(),
  returnRate: z.number().min(0).max(1).nullable(),
  avgOrderValue: z.number().nonnegative().nullable(),
});
export type ChannelAnalysis = z.infer<typeof ChannelAnalysisSchema>;

/**
 * `/api/sales-analysis?period=YYYY-MM` full response. `totals` are the
 * organization's window totals and are `null` unless every date of the window
 * was collected and every input measured.
 */
export const SalesAnalysisDataSchema = z.object({
  period: FinancePeriodSchema,
  channels: z.array(ChannelAnalysisSchema),       // sorted by totalRevenue desc
  totals: z.object({
    totalRevenue: z.number().int().nonnegative().nullable(),
    totalProfit: z.number().int().nullable(),
    totalOrders: z.number().int().nonnegative().nullable(),
    totalCost: z.number().int().nonnegative().nullable(),
    profitRate: z.number().nullable(),
    orphanReturnCount: z.number().int().nonnegative().nullable(),
  }),
  basis: FinanceWindowBasisSchema,
});
export type SalesAnalysisData = z.infer<typeof SalesAnalysisDataSchema>;
