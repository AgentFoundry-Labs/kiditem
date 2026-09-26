'use client';

import {
  isOperationTerminal,
  OperationFinishResponseSchema,
  OperationListResponseSchema,
  type OperationKind,
  type OperationListResponse,
  type OperationView,
} from '@kiditem/shared/operation';
import type { QueryKey } from '@tanstack/react-query';
import {
  COLLECTION_IDLE_POLL_MS,
  COLLECTION_RUNNING_POLL_MS,
  type CollectionSourceAdapter,
} from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { requestOperationCancel, requestOperationStart } from '@/lib/operation-start';
import { attemptFailureText } from '@/lib/operator-error';
import { queryKeys } from '@/lib/query-keys';

/**
 * 캡처를 보관하는 Orders 실행 kind(셀피아 송장·몰 주문, KID-359 H3)를 도는 확장 빌드가 `ping`에 싣는 표시.
 * 없는 빌드엔 시작을 보내지 않는다(옛 빌드는 이 kind를 모른다).
 */
export const ORDER_CAPTURE_OPERATION_CAPABILITY = 'orderCaptureOperationKindsV1' as const;

/** reader가 한 kind에서 읽는 최근 실행 수. 첫 행이 가장 최근 실행이다. */
const RECENT_LIMIT = 20;
/** 시작을 누른 화면이 결과를 기다리는 상한. 옛 확장 응답 제한(190초)과 같은 크기. */
const WAIT_LIMIT_MS = 190_000;

export function orderOperationsQueryKey(kind: OperationKind): QueryKey {
  return [...queryKeys.orders.all, 'operations', kind];
}

/** 실행 하나(`GET /api/operations/:id`). 기다리는 화면이 목록 대신 읽는다. */
export async function readOrderOperation(operationId: string): Promise<OperationView> {
  return OperationFinishResponseSchema.parse(await apiClient.get(`/api/operations/${encodeURIComponent(operationId)}`)).operation;
}

export async function readOrderOperations(kind: OperationKind): Promise<OperationListResponse> {
  return OperationListResponseSchema.parse(await apiClient.get(`/api/operations?kinds=${kind}&limit=${RECENT_LIMIT}`));
}

/**
 * 확장에 실행 하나를 시작시키고 그 실행 id를 돌려준다. 같은 실행이 이미 돌면(확장이 같은 idempotencyKey로 받은 경우)
 * 그 id를, 같은 잠금의 다른 실행이 돌면 서버 문장으로 거절한다.
 */
export async function startOrderOperation(kind: OperationKind, scope: Record<string, unknown>): Promise<string> {
  const outcome = await requestOperationStart(kind, scope, { capability: ORDER_CAPTURE_OPERATION_CAPABILITY });
  if (outcome.outcome === 'refused') throw new Error(outcome.message);
  if (!outcome.operationId) throw new Error('확장 프로그램이 실행 번호를 알려 주지 않았습니다. 잠시 후 다시 시도해 주세요.');
  return outcome.operationId;
}

/**
 * 실패·중단으로 끝난 실행. `errorCode`는 수집 화면의 분류 코드(로그인·운영자 확인)로 옮겨 적어, 몰 카드·활동 기록이
 * 옛 수집과 같은 말(로그인 필요 · 인증 필요)을 하게 한다.
 */
export class OrderOperationFailure extends Error {
  readonly operation: OperationView;
  readonly errorCode: string | null;

  constructor(operation: OperationView, message: string) {
    super(message);
    this.name = 'OrderOperationFailure';
    this.operation = operation;
    this.errorCode = operation.errorCode === 'SITE_LOGIN_REQUIRED'
      ? 'login_required'
      : operation.errorCode === 'SITE_VERIFICATION_REQUIRED'
        ? 'operator_action_required'
        : null;
  }
}

/**
 * 실행이 끝날 때까지 그 실행 하나(`GET /api/operations/:id`)를 2초마다 읽는다 — 끝나면 더 읽지 않는다. 성공이면 그 실행, 실패·중단이면 운영자 문장(`OrderOperationFailure`),
 * 상한을 넘기면 아직 끝나지 않았다는 문장을 던진다(실행은 확장에서 계속되고 화면의 공용 컨트롤이 이어서 보여 준다).
 * `signal`이 끊기면 기다리기만 멈춘다(실행 중단은 컨트롤의 몫).
 */
export async function waitForOrderOperation(
  kind: OperationKind,
  operationId: string,
  options: {
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    timeoutMs?: number;
    source?: string;
    signal?: AbortSignal;
  } = {},
): Promise<OperationView> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + (options.timeoutMs ?? WAIT_LIMIT_MS);
  for (;;) {
    options.signal?.throwIfAborted();
    const current = await readOrderOperation(operationId);
    if (current.kind !== kind) throw new Error('다른 종류의 실행입니다.');
    if (isOperationTerminal(current.status)) {
      if (current.status === 'succeeded') return current;
      throw new OrderOperationFailure(current, attemptFailureText(current, options.source ?? null) ?? '실행이 실패했습니다.');
    }
    if (now() >= deadline) throw new Error('실행이 아직 끝나지 않았습니다. 잠시 후 다시 확인해 주세요.');
    await sleep(COLLECTION_RUNNING_POLL_MS);
  }
}

function state(status: OperationListResponse | undefined, match: (operation: OperationView) => boolean) {
  const operations = (status?.operations ?? []).filter(match);
  return {
    running: operations.find((operation) => operation.status === 'executing' || operation.status === 'prepared') ?? null,
    lastSucceeded: operations.find((operation) => operation.status === 'succeeded') ?? null,
  };
}

/**
 * 공용 수집 컨트롤에 거는 Orders 실행 kind 하나. 시작은 화면이 따로 하고(결과를 받아 가는 쪽), 컨트롤은 도는 실행과
 * 중단만 맡는다. 중단 = 확장 `operation.cancel` → 서버 cancel.
 */
export function orderOperationControl(options: Readonly<{
  kind: OperationKind;
  sourceKey: string;
  label: string;
  match?: (operation: OperationView) => boolean;
  scopeLabel?: (operation: OperationView) => string | null;
}>): CollectionSourceAdapter<OperationListResponse> {
  const match = options.match ?? (() => true);
  return {
    sourceKey: options.sourceKey,
    label: options.label,
    statusQuery: collectionSourceStatusQueryOptions<OperationListResponse, Error, OperationListResponse, QueryKey>({
      queryKey: orderOperationsQueryKey(options.kind),
      queryFn: () => readOrderOperations(options.kind),
      refetchInterval: COLLECTION_IDLE_POLL_MS,
      refetchIntervalInBackground: false,
      meta: { suppressGlobalErrorToast: true },
    }),
    readRunning: (status) => {
      const { running } = state(status, match);
      return running ? { attemptId: running.id, scopeLabel: options.scopeLabel?.(running) ?? null } : null;
    },
    readStatusIdentity: (status) =>
      (status.operations ?? []).filter(match).map((operation) => `${operation.id}:${operation.status}`).join(','),
    cancelInExtension: (operationId) => requestOperationCancel(operationId),
    cancelOnServer: (operationId) => apiClient.post(`/api/operations/${encodeURIComponent(operationId)}/cancel`),
    readCompleteId: (status) => state(status, match).lastSucceeded?.id ?? null,
    onNewComplete: () => undefined,
  };
}
