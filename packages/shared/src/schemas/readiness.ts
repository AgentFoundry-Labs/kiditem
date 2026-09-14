import { z } from 'zod';
import { DashboardSnapshotBasisSchema } from './dashboard.js';

export const ReadinessCheckSchema = z.object({
  key: z.string(),
  label: z.string(),
  basis: DashboardSnapshotBasisSchema,
  detail: z.string(),
  lastSyncedAt: z.string().nullable(),
  count: z.number().nullable(),
  /** 기준 일자 (YYYY-MM-DD) — Wing/광고는 전일 기준 */
  referenceDate: z.string().nullable(),
  /** 이번달 1일 ~ 기준일까지 기대 일자들 (YYYY-MM-DD[]) — 일별 시각화용 */
  expectedDates: z.array(z.string()).nullable(),
  /** 데이터 없는 날짜들 (YYYY-MM-DD[]) */
  missingDates: z.array(z.string()).nullable(),
});
export type ReadinessCheck = z.infer<typeof ReadinessCheckSchema>;

export const ReadinessResponseSchema = z.object({
  checks: z.array(ReadinessCheckSchema),
});
export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;

export const RebuildReadinessResponseSchema = z.object({
  state: z.enum(['ready', 'snapshot_required']),
  target: z.enum(['local', 'office']).nullable(),
});
export type RebuildReadinessResponse = z.infer<
  typeof RebuildReadinessResponseSchema
>;
