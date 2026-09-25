'use client';

import {
  OperationListResponseSchema,
  type OperationListResponse,
  type OperationView,
} from '@kiditem/shared/operation';
import {
  COLLECTION_IDLE_POLL_MS,
  type CollectionSourceAdapter,
  type CollectionStartOutcome,
} from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { requestOperationCancel, requestOperationStart, type OperationStartOutcome } from '@/lib/operation-start';
import { queryKeys } from '@/lib/query-keys';
import type { SourcingExtensionKind } from '@kiditem/shared/sourcing-operation';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

/** 소싱 kind 6종(KID-360)을 도는 확장 빌드가 `ping`에 싣는 표시. 없는 빌드엔 시작을 보내지 않는다. */
export const SOURCING_OPERATION_KINDS_CAPABILITY = 'sourcingOperationKindsV1' as const;

/**
 * 한 kind의 최근 실행 수. 대상이 여럿인 kind(라이브 방송 URL·추천 키워드)도 화면 하나가 보는 대상은 몇 개라
 * 최근 20개면 대상마다 마지막 실행이 잡힌다.
 */
const RECENT_LIMIT = 20;

/** 조직의 이 kind 최근 실행 목록(`GET /api/operations`). 모든 컨트롤이 같은 읽기를 대상별로 나눠 본다. */
export function sourcingOperationsQueryKey(kind: SourcingExtensionKind): QueryKey {
  // 'source-status' 표지: 소싱 완료가 `queryKeys.sourcing.all`을 새로 읽을 때 상태 읽기는 빼는 규칙(옛 attempt와 같다).
  return [...queryKeys.sourcing.all, 'operations', 'source-status', kind];
}

export function sourcingOperationsQueryOptions(kind: SourcingExtensionKind) {
  return collectionSourceStatusQueryOptions<OperationListResponse, Error, OperationListResponse, QueryKey>({
    queryKey: sourcingOperationsQueryKey(kind),
    queryFn: async () =>
      OperationListResponseSchema.parse(await apiClient.get(`/api/operations?kinds=${kind}&limit=${RECENT_LIMIT}`)),
    // 도는 실행이 있으면 컨트롤이 2초로 당긴다(use-collection-source-control). 아니면 다른 탭·브라우저가 시작한 것을 60초마다 본다.
    refetchInterval: COLLECTION_IDLE_POLL_MS,
    meta: { suppressGlobalErrorToast: true },
  });
}

export function isLiveOperation(operation: OperationView): boolean {
  return operation.status === 'executing' || operation.status === 'prepared';
}

/** 이 대상의 실행, 최근 것부터(reader가 최근 것부터 준다). */
export function operationsFor(
  status: OperationListResponse | undefined,
  match: (operation: OperationView) => boolean = () => true,
): OperationView[] {
  return (status?.operations ?? []).filter(match);
}

/** 이 대상의 마지막 실행과 마지막 성공. 화면 문구(수집 중·중단·실패·완료 시각)는 이 둘로 말한다. */
export function sourcingOperationState(
  status: OperationListResponse | undefined,
  match?: (operation: OperationView) => boolean,
): { latest: OperationView | null; running: OperationView | null; lastSucceeded: OperationView | null } {
  const operations = operationsFor(status, match);
  return {
    latest: operations[0] ?? null,
    running: operations.find(isLiveOperation) ?? null,
    lastSucceeded: operations.find((operation) => operation.status === 'succeeded') ?? null,
  };
}

/** 성공한 실행이 발행한 원천 관측 창의 끝(없으면 끝난 시각). 화면의 "기준 시각"이다. */
export function operationCutoffAt(operation: OperationView | null): string | null {
  if (!operation) return null;
  const windowEndAt = operation.result?.windowEndAt;
  if (typeof windowEndAt === 'string') return windowEndAt;
  const { finishedAt } = operation;
  return finishedAt === null ? null : typeof finishedAt === 'string' ? finishedAt : finishedAt.toISOString();
}

function startOutcome(outcome: OperationStartOutcome): CollectionStartOutcome {
  if (outcome.outcome === 'refused') return outcome;
  return { outcome: outcome.outcome, attemptId: outcome.operationId };
}

export type SourcingOperationCollectionOptions<TInput> = Readonly<{
  kind: SourcingExtensionKind;
  /** 컨트롤을 나누는 이름. 대상이 여럿인 kind는 대상까지 넣는다. */
  sourceKey: string;
  label: string;
  /** 이 컨트롤이 보는 대상(없으면 kind의 모든 실행). */
  match?: (operation: OperationView) => boolean;
  /** 입력 → 실행 scope. 없으면 화면이 컨트롤 밖에서 시작하는 kind다. */
  scope?: (input: TInput) => Promise<Record<string, unknown>> | Record<string, unknown>;
  scopeLabel?: (operation: OperationView) => string | null;
  onNewComplete: (queryClient: QueryClient) => void;
}>;

/**
 * 확장이 도는 소싱 kind 하나(KID-360)를 공용 수집 컨트롤에 건다. 시작 = 확장 `operation.start{kind, scope}`(확장이
 * begin하고 곧바로 답한다), 진행·완료 = 실행 reader, 중단 = 확장 `operation.cancel` → 안 되면 서버 cancel.
 */
export function sourcingOperationCollection<TInput = void>(
  options: SourcingOperationCollectionOptions<TInput>,
): CollectionSourceAdapter<OperationListResponse, TInput> {
  const { kind, match, scope } = options;
  return {
    sourceKey: options.sourceKey,
    label: options.label,
    statusQuery: sourcingOperationsQueryOptions(kind),
    readRunning: (status) => {
      const { running } = sourcingOperationState(status, match);
      return running ? { attemptId: running.id, scopeLabel: options.scopeLabel?.(running) ?? null } : null;
    },
    readProgress: (status) => {
      const { running } = sourcingOperationState(status, match);
      return running ? `${running.id}:${JSON.stringify(running.progress ?? null)}` : null;
    },
    // 비교는 `!==`라 문자열이어야 한다.
    readStatusIdentity: (status) =>
      operationsFor(status, match).map((operation) => `${operation.id}:${operation.status}`).join(','),
    ...(scope
      ? { start: async (input: TInput) => startOutcome(await requestOperationStart(kind, await scope(input), { capability: SOURCING_OPERATION_KINDS_CAPABILITY })) }
      : {}),
    cancelInExtension: (operationId) => requestOperationCancel(operationId),
    cancelOnServer: (operationId) => apiClient.post(`/api/operations/${encodeURIComponent(operationId)}/cancel`),
    readCompleteId: (status) => sourcingOperationState(status, match).lastSucceeded?.id ?? null,
    onNewComplete: options.onNewComplete,
  };
}

/** 소싱 완료가 새로 쓴 소싱 읽기를 다시 읽는다(상태 읽기는 스스로 폴링한다). */
export function invalidateSourcingReads(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.sourcing.all,
    predicate: (query) => !query.queryKey.includes('source-status'),
  });
}
