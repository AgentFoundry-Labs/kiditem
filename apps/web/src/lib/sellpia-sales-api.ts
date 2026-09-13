import {
  SellpiaSalesSummarySchema,
  type SellpiaSalesSummary,
} from '@kiditem/shared/dashboard';
import { apiClient } from '@/lib/api-client';
import { z } from 'zod';

// Sellpia 판매현황(몰별 매출) 백엔드 read/ingest 래퍼.

// 느린/지연 백엔드에서 무한 대기하지 않도록 타임아웃을 건다. 초과 시 throw →
// React Query 가 재시도(백오프)한다. 기간 전환 시 한 요청이 지연돼도 카드가 멈추지 않는다.
const FETCH_TIMEOUT_MS = 12_000;

export function sellpiaSalesErrorMessage(
  error: unknown,
  fallback = '판매현황 수집에 실패했습니다.',
): string {
  if (!(error instanceof Error)) return fallback;
  if (/expired transaction|transaction.*timeout|P2028/i.test(error.message)) {
    return '매출 저장 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
  }
  return error.message;
}

export async function fetchSellpiaSalesSummary(params?: {
  from?: string;
  to?: string;
}): Promise<SellpiaSalesSummary> {
  const query = new URLSearchParams();
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  const qs = query.toString();
  const path = `/api/sellpia-sales${qs ? `?${qs}` : ''}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await apiClient.fetchRaw(path, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`판매현황 조회 실패 (HTTP ${res.status})`);
    }
    return SellpiaSalesSummarySchema.parse(await res.json());
  } finally {
    clearTimeout(timeout);
  }
}

const SellpiaSalesYmdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const SellpiaSalesSourcePlanSchema = z.object({
  sourceType: z.literal('sellpia_sales_daily'),
  parserVersion: z.literal('sellpia-sales-v1'),
  sourceOrigin: z.literal('https://kiditem.sellpia.com'),
  sourcePath: z.literal('/sale_summary.html?mode=main_link'),
  sourceAccountKey: z.literal('kiditem'),
  range: z.object({ from: SellpiaSalesYmdSchema, to: SellpiaSalesYmdSchema }).strict(),
  businessDates: z.array(SellpiaSalesYmdSchema),
}).strict();

export const SellpiaSalesSourceAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  sourceType: z.literal('sellpia_sales_daily'),
  state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
  expiresAt: z.string().datetime({ offset: true }),
  plan: SellpiaSalesSourcePlanSchema,
  actualCutoffAt: z.string().datetime({ offset: true }).nullable(),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  contentChecksum: z.string().regex(/^[0-9a-f]{64}$/i).nullable(),
  contentByteCount: z.number().int().nonnegative().nullable(),
  rowCount: z.number().int().nonnegative(),
  sellerCount: z.number().int().nonnegative(),
  businessDates: z.array(SellpiaSalesYmdSchema),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
}).strict();

export type SellpiaSalesSourceAttempt = z.infer<typeof SellpiaSalesSourceAttemptSchema>;

export const SellpiaSalesSourceOutcomeSchema = SellpiaSalesSourceAttemptSchema.extend({
  success: z.boolean(),
  terminalState: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
}).strict();

export type SellpiaSalesSourceOutcome = z.infer<typeof SellpiaSalesSourceOutcomeSchema>;

export function beginSellpiaSalesSourceAttempt(input: {
  idempotencyKey: string;
  from?: string;
  to?: string;
}): Promise<SellpiaSalesSourceAttempt> {
  const range = input.from || input.to ? { range: { from: input.from, to: input.to } } : {};
  return apiClient
    .post<unknown>('/api/sellpia-sales/attempts', range, {
      headers: { 'Idempotency-Key': input.idempotencyKey },
    })
    .then((raw) => SellpiaSalesSourceAttemptSchema.parse(raw));
}

export function readSellpiaSalesSourceAttempt(
  attemptId: string,
): Promise<SellpiaSalesSourceAttempt> {
  return apiClient.getParsed(
    `/api/sellpia-sales/attempts/${encodeURIComponent(attemptId)}`,
    SellpiaSalesSourceAttemptSchema,
  );
}
