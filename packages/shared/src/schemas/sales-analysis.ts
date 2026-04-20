import { z } from 'zod';

/**
 * `/api/sales-analysis` channel row — 채널(플랫폼)별 매출/비용/이익 요약 (Plan D.3).
 *
 * Semantic:
 * - Group key: `ChannelListing.channel` (e.g., 'coupang', 'naver', 'wing')
 *   NOT `channelName` (listing display title).
 * - channelType: derived server-side from channel ('marketplace' | 'direct' | 'other')
 *   — ChannelListing 에는 channelType 필드 없음, 서비스 상수 맵에서 생성.
 * - returnRate: ADR-0017 semantic — distinct orders returned / orders in period,
 *   INNER JOIN via Order.orderedAt. Bounded [0, 1].
 * - orphanReturnCount: Orphan (OrderReturn.orderId NULL) requestedAt ∈ period 은
 *   channel 매핑 불가이므로 channel row 에는 표시 안 하고 totals 에만 노출.
 * - Shipping: order 가 multi-channel span 시 revenue-weighted 분배 (D.1 T5 패턴).
 *   한 order 가 N 채널에 걸쳐 있으면 totalOrders 에 N 개 채널 각각 1 count —
 *   `totals.totalOrders` 는 channels 합산 아닌 global distinct Order count.
 */
export const ChannelAnalysisSchema = z.object({
  channel: z.string(),                            // 플랫폼 — 'coupang' | 'naver' | 'wing' | ...
  channelType: z.enum(['marketplace', 'direct', 'other']),
  totalOrders: z.number().int().nonnegative(),    // distinct Order count participating in this channel
  totalRevenue: z.number().int().nonnegative(),
  totalCost: z.number().int().nonnegative(),      // cogs + commission + shipping + ad + other
  totalProfit: z.number().int(),                  // may be negative
  returnCount: z.number().int().nonnegative(),    // distinct orders returned (ADR-0017 INNER JOIN)
  returnRate: z.number().min(0).max(1),           // ADR-0017 hard contract
  avgOrderValue: z.number().nonnegative(),
});
export type ChannelAnalysis = z.infer<typeof ChannelAnalysisSchema>;

/**
 * `/api/sales-analysis?period=YYYY-MM` full response.
 */
export const SalesAnalysisDataSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM'),
  channels: z.array(ChannelAnalysisSchema),       // sorted by totalRevenue desc
  totals: z.object({
    totalRevenue: z.number().int().nonnegative(),
    totalProfit: z.number().int(),
    totalOrders: z.number().int().nonnegative(),  // global distinct Order count (not channels sum)
    totalCost: z.number().int().nonnegative(),
    orphanReturnCount: z.number().int().nonnegative(),  // NEW (ADR-0017) — orphans channel 매핑 불가
  }),
});
export type SalesAnalysisData = z.infer<typeof SalesAnalysisDataSchema>;
