'use client';

import {
  isOperationTerminal,
  OperationFinishResponseSchema,
  OperationListResponseSchema,
  type OperationKind,
  type OperationListResponse,
  type OperationView,
} from '@kiditem/shared/operation';
import { SELLPIA_OPERATION_CAPABILITY } from '@kiditem/shared/sellpia-operations';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import {
  COLLECTION_IDLE_POLL_MS,
  COLLECTION_RUNNING_POLL_MS,
  type CollectionSourceAdapter,
  type CollectionStartOutcome,
} from '@/hooks/use-collection-source-control';
import { apiClient } from './api-client';
import { collectionSourceStatusQueryOptions } from './collection-source-status-query';
import { requestOperationCancel, requestOperationStart } from './operation-start';
import { attemptFailureText } from './operator-error';

/** reader가 한 kind에서 읽는 최근 실행 수. 첫 행이 가장 최근 실행이다. */
const RECENT_LIMIT = 20;
/** 계산 전에 수집을 기다리는 화면의 상한(옛 재고 대기 180초와 같다). */
const WAIT_LIMIT_MS = 180_000;

export function sellpiaOperationsQueryKey(kind: OperationKind): QueryKey {
  return ['sellpia-operations', kind];
}

export async function readSellpiaOperations(kind: OperationKind): Promise<OperationListResponse> {
  return OperationListResponseSchema.parse(await apiClient.get(`/api/operations?kinds=${kind}&limit=${RECENT_LIMIT}`));
}

/** 실행 하나(`GET /api/operations/:id`). 기다리는 화면이 목록 대신 읽는다. */
export async function readSellpiaOperation(operationId: string): Promise<OperationView> {
  return OperationFinishResponseSchema.parse(await apiClient.get(`/api/operations/${encodeURIComponent(operationId)}`)).operation;
}

/** 확장에 셀피아 실행 하나를 시작시킨다. 같은 셀피아 로그인 잠금의 실행이 돌면 서버 문장으로 거절이 온다. */
export async function startSellpiaOperation(kind: OperationKind, scope: Record<string, unknown>): Promise<CollectionStartOutcome> {
  const outcome = await requestOperationStart(kind, scope, { capability: SELLPIA_OPERATION_CAPABILITY });
  if (outcome.outcome === 'refused') return { outcome: 'refused', message: outcome.message };
  return { outcome: outcome.outcome, attemptId: outcome.operationId };
}

/**
 * 실행 하나가 끝날 때까지 2초마다 그 실행만 읽는다. 성공이면 그 실행, 실패·중단이면 운영자 문장을 던진다. 상한을
 * 넘기면 아직 끝나지 않았다는 문장을 던진다(실행은 확장에서 계속되고 공용 컨트롤이 이어서 보여 준다).
 */
export async function waitForSellpiaOperation(
  kind: OperationKind,
  operationId: string,
  options: {
    source: string;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    timeoutMs?: number;
    signal?: AbortSignal;
  },
): Promise<OperationView> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + (options.timeoutMs ?? WAIT_LIMIT_MS);
  for (;;) {
    options.signal?.throwIfAborted();
    const current = await readSellpiaOperation(operationId);
    if (current.kind !== kind) throw new Error('다른 종류의 실행입니다.');
    if (isOperationTerminal(current.status)) {
      if (current.status === 'succeeded') return current;
      throw new Error(attemptFailureText(current, options.source) ?? '수집이 완료되지 않았습니다.');
    }
    if (now() >= deadline) throw new Error('수집 대기 시간이 초과되었습니다. 잠시 후 다시 확인해 주세요.');
    await sleep(COLLECTION_RUNNING_POLL_MS);
  }
}

/** 최근 실행 목록에서 도는 실행·마지막 성공·마지막 끝난 실행. */
export function sellpiaOperationState(status: OperationListResponse | undefined) {
  const operations = status?.operations ?? [];
  return {
    running: operations.find((operation) => !isOperationTerminal(operation.status)) ?? null,
    lastSucceeded: operations.find((operation) => operation.status === 'succeeded') ?? null,
    lastFinished: operations.find((operation) => isOperationTerminal(operation.status)) ?? null,
  };
}

/**
 * 공용 수집 컨트롤에 거는 셀피아 실행 kind 하나. 시작 = 확장 `operation.start`, 중단 = 확장 `operation.cancel` →
 * 서버 cancel. 성공한 실행이 새로 보이면 `onNewComplete`로 그 kind가 발행한 읽기를 새로 한다.
 */
export function sellpiaOperationControl<TInput = void>(options: Readonly<{
  kind: OperationKind;
  sourceKey: string;
  label: string;
  /** 시작 입력(화면이 넘긴 범위 등) → 실행 scope. */
  scope: (input: TInput) => Record<string, unknown>;
  /** 도는 실행의 범위 표시(예: 매출 창). */
  scopeLabel?: (operation: OperationView) => string | null;
  onNewComplete: (queryClient: QueryClient) => void;
  enabled?: boolean;
}>): CollectionSourceAdapter<OperationListResponse, TInput> {
  return {
    sourceKey: options.sourceKey,
    label: options.label,
    statusQuery: collectionSourceStatusQueryOptions<OperationListResponse, Error, OperationListResponse, QueryKey>({
      queryKey: sellpiaOperationsQueryKey(options.kind),
      queryFn: () => readSellpiaOperations(options.kind),
      enabled: options.enabled ?? true,
      refetchInterval: COLLECTION_IDLE_POLL_MS,
      refetchIntervalInBackground: false,
      meta: { suppressGlobalErrorToast: true },
    }),
    readRunning: (status) => {
      const { running } = sellpiaOperationState(status);
      return running ? { attemptId: running.id, scopeLabel: options.scopeLabel?.(running) ?? null } : null;
    },
    start: (input) => startSellpiaOperation(options.kind, options.scope(input)),
    readProgress: (status) => {
      const { running } = sellpiaOperationState(status);
      return running ? `${running.id}:${JSON.stringify(running.progress ?? null)}` : null;
    },
    cancelInExtension: (operationId) => requestOperationCancel(operationId),
    cancelOnServer: (operationId) => apiClient.post(`/api/operations/${encodeURIComponent(operationId)}/cancel`),
    readCompleteId: (status) => sellpiaOperationState(status).lastSucceeded?.id ?? null,
    onNewComplete: options.onNewComplete,
  };
}
