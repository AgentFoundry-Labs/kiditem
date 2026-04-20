import { z } from 'zod';

/**
 * `/api/coupang-dashboard/return-summary` response (ADR-0017).
 *
 * Semantic: "이 기간 내 주문된 건 중 반품된 비율" (NOT same-period count / count).
 * Orphan returns (orderId NULL) 은 메인 집계에서 제외되고 `orphanReturnCount` 에만 반영.
 */
export const ReturnSummarySchema = z.object({
  orderCount: z.number().int().nonnegative(),
  returnCount: z.number().int().nonnegative(),
  returnRate: z.number().min(0).max(1),   // ADR-0017 hard contract — pre-fix bug produced > 1
  orphanReturnCount: z.number().int().nonnegative(),
});
export type ReturnSummary = z.infer<typeof ReturnSummarySchema>;
