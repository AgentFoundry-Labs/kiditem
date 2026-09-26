// 쿠팡 쉽먼트 발송일 조회 = 실행 kind `orders.coupang_shipment_summary`(ADR-0025, KID-359).
// 서버 owner가 쪽 상한을 정하고 finish 트랜잭션에서만 발송일을 쓴다. 확장은 supplier 목록을 읽어 청크를 올릴 뿐이다.
// 웹은 확장에 `operation.start`만 보내고, 진행·결과는 서버 `GET /api/operations`로, 달력은 `GET date-summary`로 읽는다.

import { z } from 'zod';
import { OperationListResponseSchema, type OperationView } from '@kiditem/shared/operation';
import {
  COUPANG_SHIPMENT_SUMMARY_KIND,
  CoupangShipmentSummaryProgressSchema,
  CoupangShipmentSummaryResultSchema,
} from '@kiditem/shared/orders-operations';
import { apiClient } from './api-client';
import { noteOperationLoginFailureForMall, operationLoginOptions, ROCKET_LOGIN_MALL_KEY } from './operation-login';
import { attemptFailureText } from './operator-error';
import { requestOperationStart, type OperationStartOutcome } from './operation-start';

const OPERATIONS_PATH = '/api/operations';
const DATE_SUMMARY_PATH = '/api/coupang-shipments/date-summary';
/** 최근 실행 몇 개를 읽는다. 첫 행이 가장 최근 실행이다. */
const RECENT_OPERATIONS = 5;

/** 확장이 supplier 쿠키 과다(400)로 멈췄다 — 화면은 "쿠팡 쿠키 정리"를 제안한다. */
export const SITE_COOKIE_BLOAT_CODE = 'SITE_COOKIE_BLOAT';
/** supplier 로그인 화면에서 멈췄다 — 화면은 "Supplier Hub 열기"를 제안한다. */
export const SITE_LOGIN_REQUIRED_CODE = 'SITE_LOGIN_REQUIRED';

const DateSummaryEntrySchema = z.object({
  date: z.string(),
  count: z.number().int().nonnegative().nullable(),
  boxes: z.number().int().nonnegative().nullable(),
  capturedAt: z.string().datetime(),
  verified: z.boolean(),
});
const DateSummarySchema = z.object({ items: z.array(DateSummaryEntrySchema) });
export type CoupangShipmentDateSummaryEntry = z.infer<typeof DateSummaryEntrySchema>;

/** 달력: 발송일마다 가장 최근 성공한 조회의 값, 기준 행은 미검증. */
export function loadCoupangShipmentDateSummary(): Promise<{ items: CoupangShipmentDateSummaryEntry[] }> {
  return apiClient.getParsed(DATE_SUMMARY_PATH, DateSummarySchema);
}

/** 화면이 보는 한 조회. */
export type ShipmentSummaryRun =
  | { status: 'idle' }
  | {
    status: 'running' | 'done' | 'error' | 'cancelled';
    operationId: string;
    /** 읽은 쪽 / 쪽 상한. */
    current: number;
    total: number;
    /** 성공한 조회에서만: 저장한 발송일 수·센 쉽먼트 수. */
    dates: number | null;
    rows: number | null;
    errorCode: string | null;
    error: string | null;
    finishedAt: string | null;
  };

const PlanSchema = z.object({ maxPages: z.number().int() }).passthrough();

/** 로그인 화면이면 확장이 로켓 계정의 저장 자격으로 로그인한다(KID-377). */
export async function startCoupangShipmentSummary(): Promise<OperationStartOutcome> {
  return requestOperationStart(COUPANG_SHIPMENT_SUMMARY_KIND, {}, await operationLoginOptions(ROCKET_LOGIN_MALL_KEY));
}

/** 가장 최근 발송일 조회. 없으면 idle. */
export async function readLatestCoupangShipmentSummary(): Promise<ShipmentSummaryRun> {
  const { operations } = OperationListResponseSchema.parse(
    await apiClient.get<unknown>(`${OPERATIONS_PATH}?kinds=${COUPANG_SHIPMENT_SUMMARY_KIND}&limit=${RECENT_OPERATIONS}`),
  );
  const [latest] = operations;
  if (!latest) return { status: 'idle' };
  // 로켓 계정 자격을 서플라이어 허브가 거절했으면 그 계정의 자동 로그인을 멈춘다(KID-377).
  noteOperationLoginFailureForMall(ROCKET_LOGIN_MALL_KEY, latest);
  return toRun(latest);
}

export async function cancelCoupangShipmentSummary(operationId: string): Promise<void> {
  await apiClient.post(`${OPERATIONS_PATH}/${encodeURIComponent(operationId)}/cancel`);
}

function toRun(operation: OperationView): Extract<ShipmentSummaryRun, { operationId: string }> {
  const progress = CoupangShipmentSummaryProgressSchema.safeParse(operation.progress);
  const plan = PlanSchema.safeParse(operation.plan);
  const result = CoupangShipmentSummaryResultSchema.safeParse(operation.result);
  return {
    status: operation.status === 'succeeded'
      ? 'done'
      : operation.status === 'failed'
        ? 'error'
        : operation.status === 'cancelled'
          ? 'cancelled'
          : 'running',
    operationId: operation.id,
    current: progress.success ? progress.data.current : 0,
    total: progress.success ? progress.data.total : plan.success ? plan.data.maxPages : 0,
    dates: result.success ? result.data.dates : null,
    rows: result.success ? result.data.rows : null,
    errorCode: operation.errorCode,
    error: operation.status === 'failed' ? attemptFailureText(operation, 'coupang_shipment_summary') ?? '쉽먼트 조회에 실패했습니다.' : null,
    finishedAt: operation.finishedAt ? new Date(operation.finishedAt).toISOString() : null,
  };
}
