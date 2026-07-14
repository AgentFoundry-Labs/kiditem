import { z } from 'zod';

const ReadinessCheckStatusSchema = z.enum(['ok', 'stale', 'missing']);

export const ReadinessCheckSchema = z.object({
  key: z.string(),
  label: z.string(),
  status: ReadinessCheckStatusSchema,
  detail: z.string(),
  lastSyncedAt: z.string().nullable(),
  count: z.number().nullable(),
  /** 'server' = 앱 내부 엔드포인트 트리거 가능, 'extension' = 익스텐션 필요 */
  collector: z.enum(['server', 'extension']),
  /** collector === 'server' 일 때만 */
  collectEndpoint: z.string().nullable(),
  /** collector === 'extension' 일 때, 익스텐션이 열어서 스크래핑할 URL 목록 */
  scrapeUrls: z.array(z.string()).nullable(),
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
  allOk: z.boolean(),
});
export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;

export const RebuildReadinessResponseSchema = z.object({
  state: z.enum(['ready', 'snapshot_required']),
  target: z.enum(['local', 'staging', 'production']).nullable(),
  requiredImports: z.array(z.enum(['sellpia', 'wing'])),
});
export type RebuildReadinessResponse = z.infer<
  typeof RebuildReadinessResponseSchema
>;
