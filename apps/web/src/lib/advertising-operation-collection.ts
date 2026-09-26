'use client';

// 광고 키워드·경쟁사 수집 = 실행 kind `advertising.*`(ADR-0025, KID-362). 웹은 확장에 `operation.start`만 보내고
// 진행·완료는 서버 실행 reader(`GET /api/operations?kinds=`)로 본다. 세 화면(상품 추적·순위 추적·경쟁사 추적)이 같이 쓴다.

import {
  OperationListResponseSchema,
  type OperationKind,
  type OperationListResponse,
  type OperationView,
} from '@kiditem/shared/operation';
import { ADVERTISING_KEYWORD_OPERATION_CAPABILITY } from '@kiditem/shared/advertising-operations';
import {
  COLLECTION_IDLE_POLL_MS,
  type CollectionSourceAdapter,
  type CollectionStartOutcome,
} from '@/hooks/use-collection-source-control';
import { apiClient } from './api-client';
import { collectionSourceStatusQueryOptions } from './collection-source-status-query';
import { requestOperationCancel, requestOperationStart, type OperationStartOutcome } from './operation-start';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

/** 한 kind의 최근 실행 수. 대상이 키워드인 kind도 화면 하나가 보는 키워드는 몇 개라 20개면 대상마다 마지막 실행이 잡힌다. */
const RECENT_LIMIT = 20;

export function advertisingOperationsQueryOptions(kind: OperationKind, queryKey: QueryKey) {
  return collectionSourceStatusQueryOptions<OperationListResponse, Error, OperationListResponse, QueryKey>({
    queryKey,
    queryFn: async () =>
      OperationListResponseSchema.parse(await apiClient.get(`/api/operations?kinds=${kind}&limit=${RECENT_LIMIT}`)),
    // 도는 실행이 있으면 컨트롤이 2초로 당긴다(use-collection-source-control).
    refetchInterval: COLLECTION_IDLE_POLL_MS,
    meta: { suppressGlobalErrorToast: true },
  });
}

export function isLiveOperation(operation: OperationView): boolean {
  return operation.status === 'executing' || operation.status === 'prepared';
}

/** 마지막 실행·도는 실행·마지막 성공(reader가 최근 것부터 준다). */
export function advertisingOperationState(
  status: OperationListResponse | undefined,
  match: (operation: OperationView) => boolean = () => true,
): { latest: OperationView | null; running: OperationView | null; lastSucceeded: OperationView | null } {
  const operations = (status?.operations ?? []).filter(match);
  return {
    latest: operations[0] ?? null,
    running: operations.find(isLiveOperation) ?? null,
    lastSucceeded: operations.find((operation) => operation.status === 'succeeded') ?? null,
  };
}

/** 도는 실행이 운영자를 기다리면(쿠팡 검증 화면) 그 안내. 아니면 null. */
export function operatorAttentionText(operation: OperationView | null): string | null {
  const attention = operation?.progress?.attention;
  if (!attention || typeof attention !== 'object' || Array.isArray(attention)) return null;
  const { kind, site, label } = attention as Record<string, unknown>;
  if (kind !== 'verification') return null;
  const siteName = typeof site === 'string' && site ? site : '수집';
  const target = typeof label === 'string' && label ? ` · ${label}` : '';
  return `${siteName} 탭에서 보안 확인을 통과해 주세요 — 통과하면 자동으로 이어집니다${target}`;
}

function startOutcome(outcome: OperationStartOutcome): CollectionStartOutcome {
  if (outcome.outcome === 'refused') return outcome;
  return { outcome: outcome.outcome, attemptId: outcome.operationId };
}

/** 확장에 광고 kind 하나를 시작시킨다(이 kind들을 도는 빌드만). */
export function startAdvertisingOperation(kind: OperationKind, scope: Record<string, unknown>): Promise<OperationStartOutcome> {
  return requestOperationStart(kind, scope, { capability: ADVERTISING_KEYWORD_OPERATION_CAPABILITY });
}

export type AdvertisingOperationCollectionOptions<TInput> = Readonly<{
  kind: OperationKind;
  sourceKey: string;
  label: string;
  /** 상태 읽기 키. 완료가 원장 읽기를 무효화할 때 이 키는 빼도록 'source-status'를 넣는다. */
  queryKey: QueryKey;
  match?: (operation: OperationView) => boolean;
  /** 입력 → 실행 scope. 없으면 화면이 컨트롤 밖에서 시작하는 kind다. */
  scope?: (input: TInput) => Promise<Record<string, unknown>> | Record<string, unknown>;
  scopeLabel?: (operation: OperationView) => string | null;
  onNewComplete: (queryClient: QueryClient) => void;
}>;

/**
 * 확장이 도는 광고 kind 하나를 공용 수집 컨트롤에 건다. 시작 = 확장 `operation.start{kind, scope}`, 진행·완료 = 실행 reader,
 * 중단 = 확장 `operation.cancel` → 안 되면 서버 cancel.
 */
export function advertisingOperationCollection<TInput = void>(
  options: AdvertisingOperationCollectionOptions<TInput>,
): CollectionSourceAdapter<OperationListResponse, TInput> {
  const { kind, match, scope } = options;
  return {
    sourceKey: options.sourceKey,
    label: options.label,
    statusQuery: advertisingOperationsQueryOptions(kind, options.queryKey),
    readRunning: (status) => {
      const { running } = advertisingOperationState(status, match);
      return running
        ? { attemptId: running.id, scopeLabel: operatorAttentionText(running) ?? options.scopeLabel?.(running) ?? null }
        : null;
    },
    readProgress: (status) => {
      const { running } = advertisingOperationState(status, match);
      return running ? `${running.id}:${JSON.stringify(running.progress ?? null)}` : null;
    },
    readStatusIdentity: (status) =>
      (status.operations ?? []).filter(match ?? (() => true)).map((operation) => `${operation.id}:${operation.status}`).join(','),
    ...(scope
      ? { start: async (input: TInput) => startOutcome(await startAdvertisingOperation(kind, await scope(input))) }
      : {}),
    cancelInExtension: (operationId) => requestOperationCancel(operationId),
    cancelOnServer: (operationId) => apiClient.post(`/api/operations/${encodeURIComponent(operationId)}/cancel`),
    readCompleteId: (status) => advertisingOperationState(status, match).lastSucceeded?.id ?? null,
    onNewComplete: options.onNewComplete,
  };
}
