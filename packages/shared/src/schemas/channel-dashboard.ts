import { z } from 'zod';
import { zIsoDate } from './common.js';

/**
 * `/api/coupang-dashboard` response. Internal shape owned by
 * `apps/server/src/channels/services/channel-dashboard.service.ts`.
 *
 * `lastModifiedAt` surfaces ChannelListing.updatedAt (renamed from `lastSyncedAt`
 * in Plan B2c.dashboard R-07 — ChannelListing is bumped on any edit, not only
 * sync). Nullable when a tenant has no ChannelListing yet. Currently not rendered
 * by UI — reserved for future "last edit" indicator (profit-loss/page.tsx:144 pattern).
 */
export const ChannelDashboardSummarySchema = z.object({
  todayOrders: z.object({
    count: z.number().int().nonnegative(),
    revenue: z.number().int().nonnegative(),
  }),
  pendingAccept: z.number().int().nonnegative(),
  pendingReturns: z.number().int().nonnegative(),
  lastModifiedAt: zIsoDate.nullable(),
});
export type ChannelDashboardSummary = z.infer<typeof ChannelDashboardSummarySchema>;

/**
 * `/api/coupang-dashboard/trend?from=&to=` response element.
 *
 * `day` is KST-anchored yyyy-MM-dd produced by `Date.prototype.toISOString().split('T')[0]`
 * on a KST-truncated server value. Zod validates string shape, not timezone.
 *
 * Parse budget: server caps trend to 90 rows × 3 fields — safe under 2ms main-thread Zod parse.
 */
export const RevenueTrendPointSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  revenue: z.number().int().nonnegative(),
  orderCount: z.number().int().nonnegative(),
});
export type RevenueTrendPoint = z.infer<typeof RevenueTrendPointSchema>;

/** `/api/coupang-dashboard/ranking?from=&to=` response element (top-10, server-sorted by revenue DESC). */
export const ProductRankingRowSchema = z.object({
  sellerProductId: z.string(),
  sellerProductName: z.string(),
  revenue: z.number().int().nonnegative(),
  orderCount: z.number().int().nonnegative(),
});
export type ProductRankingRow = z.infer<typeof ProductRankingRowSchema>;

/** `/api/coupang-dashboard/return-reasons?from=&to=` response element. */
export const ReturnReasonRowSchema = z.object({
  reason: z.string(),
  count: z.number().int().nonnegative(),
});
export type ReturnReasonRow = z.infer<typeof ReturnReasonRowSchema>;

/**
 * `/api/coupang-dashboard/return-fault-split?from=&to=` response.
 * `faultBy` is `VarChar(20)` — CUSTOMER/VENDOR only per C-11 (Plan B2c.dashboard).
 */
export const ReturnFaultSplitSchema = z.object({
  customer: z.number().int().nonnegative(),
  vendor: z.number().int().nonnegative(),
});
export type ReturnFaultSplit = z.infer<typeof ReturnFaultSplitSchema>;
