// 쿠팡 직배송 캡처 = 실행 kind `orders.coupang_directship`(ADR-0025, KID-359). 옛 attempt API와 같은 이름을 두어 주문수집
// 화면의 절차(달력·카드·중단)는 그대로 두고, 속은 실행 계약이다: 시작은 확장의 `operation.start`, 상태는
// `GET /api/operations`, 캡처는 성공한 실행 ID로 읽는다. "attemptId"는 이제 실행 ID다.

import { z } from 'zod';
import {
  CoupangDirectCenterSchema,
  CoupangDirectPurchaseOrderSchema,
} from '@kiditem/shared/coupang-direct-order';
import { OperationGetResponseSchema, OperationListResponseSchema, type OperationView } from '@kiditem/shared/operation';
import { COUPANG_DIRECTSHIP_KIND } from '@kiditem/shared/orders-operations';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import { attemptFailureText } from '@/lib/operator-error';
import { operationLoginOptions, ROCKET_LOGIN_MALL_KEY } from '@/lib/operation-login';
import { requestOperationCancel, requestOperationStart } from '@/lib/operation-start';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import {
  getOrderCollectionEnvironmentKey,
  type OrderCollectionAttemptContext,
} from './order-collection-source-owner';

const OPERATIONS_PATH = '/api/operations';
const CAPTURE_PATH = '/api/orders/collection/coupang-directship/operations';
const ACTIVE_STORAGE_PREFIX = 'kiditem:orders:coupang-directship-attempt';
/** 조직의 최근 직배송 실행 몇 개(진행 중·마지막 실행). 계정마다 나눠 본다. */
const RECENT_LIMIT = 10;
/** 성공한 실행은 따로 더 넓게 읽는다 — 실패·취소가 최근 창을 채워도 마지막 성공이 밀려나지 않게(리뷰 M1). */
const SUCCEEDED_LIMIT = 20;
/** 캡처가 끝나기를 기다리는 간격과 상한(옛 확장 호출 240초보다 넉넉히 — 발주별 상세가 많다). */
const WAIT_POLL_MS = 1_500;
const WAIT_MAX_MS = 10 * 60_000;

const CoupangDirectCaptureSchema = z.object({
  channelAccountId: z.string().uuid(),
  pos: z.array(CoupangDirectPurchaseOrderSchema).max(4_000),
  centers: z.record(z.string(), CoupangDirectCenterSchema),
}).strict();

/** 화면이 보는 직배송 실행(옛 attempt 모양). 실행 상태는 RUNNING·COMPLETE·FAILED로 줄인다(취소 = USER_CANCELLED 실패). */
export type CoupangDirectOwnerAttempt = {
  attemptId: string;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  plan: { channelAccountId: string };
  startedAt: string;
  expiresAt: string | null;
  endedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};
/** 실행 계약에는 웹이 쥘 토큰이 없다 — 옛 흐름이 요구하는 칸을 실행 ID로 채운다. */
export type CoupangDirectOwnerAttemptControl = CoupangDirectOwnerAttempt & { attemptToken: string };
export type CoupangDirectOwnerCapture = {
  attempt: CoupangDirectOwnerAttempt;
  capture: z.infer<typeof CoupangDirectCaptureSchema>;
};

export type ActiveCoupangDirectAttempt = {
  attemptId: string | null;
  idempotencyKey: string | null;
  channelAccountId: string | null;
};

const ActiveCoupangDirectAttemptSchema = z.object({
  attemptId: z.string().uuid().nullable(),
  idempotencyKey: z.string().uuid().nullable(),
  channelAccountId: z.string().uuid().nullable(),
}).strict();

function activeStorageKey(organizationId: string, environmentKey = getOrderCollectionEnvironmentKey()): string {
  return [ACTIVE_STORAGE_PREFIX, encodeURIComponent(organizationId), encodeURIComponent(environmentKey)].join(':');
}

export function readActiveCoupangDirectAttempt(
  organizationId: string,
  environmentKey = getOrderCollectionEnvironmentKey(),
): ActiveCoupangDirectAttempt | null {
  const raw = safeStorageGet('local', activeStorageKey(organizationId, environmentKey));
  if (!raw) return null;
  try {
    const parsed = ActiveCoupangDirectAttemptSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function rememberActiveCoupangDirectAttempt(
  organizationId: string,
  attempt: ActiveCoupangDirectAttempt,
  environmentKey = getOrderCollectionEnvironmentKey(),
): void {
  safeStorageSet('local', activeStorageKey(organizationId, environmentKey), JSON.stringify(attempt));
}

export function newCoupangDirectIdempotencyKey(): string {
  return createSecureRandomUuid();
}

function live(operation: OperationView): boolean {
  return operation.status === 'executing' || operation.status === 'prepared';
}

function iso(value: string | Date | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

/** 실행 → 옛 attempt 모양. */
export function directshipAttemptView(operation: OperationView): CoupangDirectOwnerAttempt {
  const plan = operation.plan as { channelAccountId?: unknown } | null;
  return {
    attemptId: operation.id,
    state: live(operation) ? 'RUNNING' : operation.status === 'succeeded' ? 'COMPLETE' : 'FAILED',
    plan: { channelAccountId: typeof plan?.channelAccountId === 'string' ? plan.channelAccountId : '' },
    startedAt: iso(operation.startedAt)!,
    expiresAt: iso(operation.expiresAt),
    endedAt: iso(operation.finishedAt),
    errorCode: operation.status === 'cancelled' ? (operation.errorCode ?? 'USER_CANCELLED') : operation.errorCode,
    errorMessage: operation.errorMessage,
  };
}

/** 조직의 최근 직배송 실행과 성공한 실행(겹침 없이, 시작 시각 최근 순). */
export async function readRecentCoupangDirectOperations(): Promise<OperationView[]> {
  const [recent, succeeded] = await Promise.all([
    apiClient.get<unknown>(`${OPERATIONS_PATH}?kinds=${COUPANG_DIRECTSHIP_KIND}&limit=${RECENT_LIMIT}`),
    apiClient.get<unknown>(`${OPERATIONS_PATH}?kinds=${COUPANG_DIRECTSHIP_KIND}&status=succeeded&limit=${SUCCEEDED_LIMIT}`),
  ]);
  const byId = new Map<string, OperationView>();
  for (const operation of [...OperationListResponseSchema.parse(recent).operations, ...OperationListResponseSchema.parse(succeeded).operations]) {
    byId.set(operation.id, operation);
  }
  return [...byId.values()].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

/**
 * 확장에 직배송 캡처를 시작시킨다(`operation.start`). 같은 계정의 캡처가 이미 돌면 옛 409와 같은 오류
 * (`ATTEMPT_IN_PROGRESS`, details.attemptId)로 알린다 — 화면은 그 수집을 이어서 본다.
 */
export async function beginCoupangDirectAttempt(
  idempotencyKey: string,
  channelAccountId: string,
): Promise<CoupangDirectOwnerAttemptControl> {
  // 로그인 화면이면 확장이 로켓 계정의 저장 자격으로 로그인한다(KID-377).
  const outcome = await requestOperationStart(COUPANG_DIRECTSHIP_KIND, { channelAccountId }, {
    idempotencyKey,
    ...(await operationLoginOptions(ROCKET_LOGIN_MALL_KEY)),
  });
  if (outcome.outcome === 'refused' || outcome.operationId === null) {
    const existing = outcome.outcome === 'refused' ? outcome.existingOperationId : null;
    throw new ApiError(409, 'ATTEMPT_IN_PROGRESS', outcome.outcome === 'refused' ? outcome.message : null, { attemptId: existing ?? undefined });
  }
  const operationId = outcome.operationId;
  const now = new Date().toISOString();
  return {
    attemptId: operationId,
    attemptToken: operationId,
    state: 'RUNNING',
    plan: { channelAccountId },
    startedAt: now,
    expiresAt: null,
    endedAt: null,
    errorCode: null,
    errorMessage: null,
  };
}

/** 실행 하나(옛 attempt 읽기) — `GET /api/operations/:id`. 없거나 직배송 실행이 아니면 404. */
export async function readCoupangDirectAttempt(attemptId: string): Promise<CoupangDirectOwnerAttempt> {
  const { operation } = await apiClient.getParsed(`${OPERATIONS_PATH}/${encodeURIComponent(attemptId)}`, OperationGetResponseSchema);
  if (operation.kind !== COUPANG_DIRECTSHIP_KIND) throw new ApiError(404, 'OPERATION_NOT_FOUND', null, { reason: 'coupang_directship_operation' });
  return directshipAttemptView(operation);
}

export async function readCoupangDirectAttemptControl(attemptId: string): Promise<CoupangDirectOwnerAttemptControl> {
  return { ...(await readCoupangDirectAttempt(attemptId)), attemptToken: attemptId };
}

/**
 * 확장이 캡처를 끝낼 때까지 기다린다(실행 reader를 도는 동안만 읽는다). 성공하면 그 실행이 보관한 캡처, 실패·취소면
 * 그 실행의 실패 문장으로 거절한다.
 */
export async function waitForCoupangDirectCapture(
  attemptId: string,
  options: { signal?: AbortSignal; pollMs?: number; maxMs?: number } = {},
): Promise<CoupangDirectOwnerCapture> {
  const deadline = Date.now() + (options.maxMs ?? WAIT_MAX_MS);
  for (;;) {
    if (options.signal?.aborted) throw new Error('쿠팡직배송 수집을 중단했습니다.');
    const attempt = await readCoupangDirectAttempt(attemptId);
    if (attempt.state === 'COMPLETE') return readCoupangDirectCapture(attemptId);
    if (attempt.state === 'FAILED') {
      throw new Error(attemptFailureText(attempt, 'coupang_direct_order_capture') ?? '쿠팡직배송 발주 수집에 실패했습니다.');
    }
    if (Date.now() >= deadline) throw new Error('쿠팡직배송 발주 수집이 끝나지 않았습니다. 잠시 뒤 다시 확인해 주세요.');
    await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? WAIT_POLL_MS));
  }
}

/** 성공한 실행이 보관한 캡처. */
export async function readCoupangDirectCapture(attemptId: string): Promise<CoupangDirectOwnerCapture> {
  const [attempt, capture] = await Promise.all([
    readCoupangDirectAttempt(attemptId),
    apiClient.getParsed(`${CAPTURE_PATH}/${encodeURIComponent(attemptId)}/capture`, CoupangDirectCaptureSchema),
  ]);
  return { attempt, capture };
}

/**
 * 웹 쪽에서 이 수집을 끝낸다(확장을 찾지 못함 등). 실행 계약에는 웹이 쓰는 "실패"가 없으므로 이 브라우저의 실행을
 * 멈추고 서버 실행을 취소한다 — 원장에는 아무것도 남지 않는다.
 */
export async function failCoupangDirectAttempt(
  run: OrderCollectionAttemptContext,
  _input: { code: string; message: string },
): Promise<CoupangDirectOwnerAttempt> {
  await requestOperationCancel(run.attemptId).catch(() => undefined);
  await apiClient.post(`${OPERATIONS_PATH}/${encodeURIComponent(run.attemptId)}/cancel`);
  return readCoupangDirectAttempt(run.attemptId);
}
