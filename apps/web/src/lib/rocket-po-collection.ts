'use client';

// 쿠팡 로켓 PO 수집 = 실행 kind `orders.coupang_rocket_po`(ADR-0025, KID-359). 서버 owner가 begin에서 공급자 기대값을
// 고정하고 finish 트랜잭션에서만 스냅샷을 발행한다. 웹은 확장에 `operation.start`만 보내고, 진행·완료는
// `GET /api/operations`를 계정별로 나눠 본다. 발행된 수집은 실행 ID(`rocketPoOperationId`)로 Supply가 읽는다.

import { businessDateKey, evidenceCutoffDate, kstBusinessDate } from '@kiditem/shared/common';
import { OperationListResponseSchema, type OperationListResponse, type OperationView } from '@kiditem/shared/operation';
import { COUPANG_ROCKET_PO_KIND, CoupangRocketPoScopeSchema } from '@kiditem/shared/orders-operations';
import type { QueryKey } from '@tanstack/react-query';
import { z } from 'zod';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { requestOperationCancel, requestOperationStart } from '@/lib/operation-start';
import { queryKeys } from '@/lib/query-keys';

const RUNNING_POLL_MS = 2_000;
/** 조직의 최근 로켓 PO 실행 몇 개. 계정마다 나눠 보고, 첫 행이 가장 최근이다. */
const RECENT_LIMIT = 5;
const OPERATIONS_PATH = `/api/operations?kinds=${COUPANG_ROCKET_PO_KIND}&limit=${RECENT_LIMIT}`;

export type RocketPoCollectionRange = Readonly<{ from: string; to: string }>;

const PlanRangeSchema = z.object({ from: z.string(), to: z.string() }).passthrough().transform(({ from, to }) => ({ from, to }));

/** 화면이 읽는 한 계정의 로켓 PO 원천(옛 attempt 원천과 같은 모양으로 — 상태 글자는 RUNNING·COMPLETE·FAILED). */
export type RocketPoSourceView = Readonly<{
  ready: boolean;
  latestAttempt: Readonly<{
    attemptId: string;
    state: 'RUNNING' | 'COMPLETE' | 'FAILED';
    errorCode: string | null;
    errorMessage: string | null;
  }> | null;
  latestComplete: Readonly<{ attemptId: string; actualCutoffAt: string }> | null;
  /** 가장 최근 성공한 수집이 읽은 기간(plan). */
  latestCompleteCoverage: RocketPoCollectionRange | null;
}>;

function live(operation: OperationView): boolean {
  return operation.status === 'executing' || operation.status === 'prepared';
}

/** 이 계정의 로켓 PO 실행, 최근 것부터. 끝난 실행은 잠금을 놓으므로 plan의 계정으로 가린다. */
export function accountRocketPoOperations(response: OperationListResponse | undefined, channelAccountId: string): OperationView[] {
  const accountId = channelAccountId.toLowerCase();
  return (response?.operations ?? []).filter((operation) => operation.plan?.channelAccountId === accountId);
}

function isoOf(value: string | Date | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

/**
 * 한 계정의 원천 보기. 준비됨은 옛 규칙 그대로: 가장 최근 성공한 수집의 KST 날짜가 필요한 기준일(어제 KST) 이후이고
 * 지금 도는 수집이 없다. 취소한 실행은 `USER_CANCELLED` 실패로 보여 "수집 중단됨"이 된다.
 */
export function rocketPoSourceView(response: OperationListResponse | undefined, channelAccountId: string, now = new Date()): RocketPoSourceView {
  const operations = accountRocketPoOperations(response, channelAccountId);
  const [latest] = operations;
  const complete = operations.find((operation) => operation.status === 'succeeded') ?? null;
  const completeAt = complete ? isoOf(complete.finishedAt) : null;
  const range = complete ? PlanRangeSchema.safeParse(complete.plan) : null;
  const running = latest ? live(latest) : false;
  const required = businessDateKey(evidenceCutoffDate(now));
  return {
    ready: !running && completeAt !== null && businessDateKey(kstBusinessDate(new Date(completeAt))) >= required,
    latestAttempt: latest
      ? {
        attemptId: latest.id,
        state: live(latest) ? 'RUNNING' : latest.status === 'succeeded' ? 'COMPLETE' : 'FAILED',
        errorCode: latest.status === 'cancelled' ? (latest.errorCode ?? 'USER_CANCELLED') : latest.errorCode,
        errorMessage: latest.errorMessage,
      }
      : null,
    latestComplete: complete && completeAt ? { attemptId: complete.id, actualCutoffAt: completeAt } : null,
    latestCompleteCoverage: range?.success ? range.data : null,
  };
}

/** 조직의 최근 로켓 PO 실행 reader. 도는 실행이 있을 때만 2초마다 다시 읽는다. */
export function rocketPoOperationsQueryOptions() {
  return collectionSourceStatusQueryOptions<OperationListResponse, Error, OperationListResponse, QueryKey>({
    queryKey: queryKeys.orders.rocketPoOperations(),
    queryFn: async () => OperationListResponseSchema.parse(await apiClient.get(OPERATIONS_PATH)),
    refetchInterval: (query) => ((query.state.data?.operations ?? []).some(live) ? RUNNING_POLL_MS : false),
    meta: { suppressGlobalErrorToast: true },
  });
}

/**
 * 한 로켓 계정의 PO 수집(공용 컨트롤). 확장이 실행을 begin하고 supplier 발주 화면을 읽어 청크를 올린다. 중단은 이 브라우저의
 * 실행을 멈추고(`operation.cancel`) 서버 실행을 취소한다.
 */
export function rocketPoCollection(channelAccountId: string): CollectionSourceAdapter<OperationListResponse, RocketPoCollectionRange> {
  return {
    sourceKey: `orders.coupang_rocket_po:${channelAccountId}`,
    label: '쿠팡 로켓 PO 수집',
    statusQuery: rocketPoOperationsQueryOptions(),
    readRunning: (status) => {
      const running = accountRocketPoOperations(status, channelAccountId).find(live);
      if (!running) return null;
      const range = running.plan as { from?: unknown; to?: unknown } | null;
      return { attemptId: running.id, scopeLabel: typeof range?.from === 'string' && typeof range.to === 'string' ? `${range.from} ~ ${range.to}` : null };
    },
    readProgress: (status) => {
      const running = accountRocketPoOperations(status, channelAccountId).find(live);
      return running ? `${running.id}:${JSON.stringify(running.progress ?? null)}` : null;
    },
    readStatusIdentity: (status) =>
      accountRocketPoOperations(status, channelAccountId).map((operation) => `${operation.id}:${operation.status}`).join(','),
    start: async (range) => {
      const scope = CoupangRocketPoScopeSchema.parse({
        channelAccountId,
        from: range.from,
        to: range.to,
        status: '',
        dateType: 'WAREHOUSING_PLAN_DATE',
        requireConfirmation: true,
      });
      const outcome = await requestOperationStart(COUPANG_ROCKET_PO_KIND, scope);
      return outcome.outcome === 'refused' ? outcome : { outcome: outcome.outcome, attemptId: outcome.operationId };
    },
    cancelInExtension: (operationId) => requestOperationCancel(operationId),
    cancelOnServer: (operationId) => apiClient.post(`/api/operations/${encodeURIComponent(operationId)}/cancel`),
    readCompleteId: (status) =>
      accountRocketPoOperations(status, channelAccountId).find((operation) => operation.status === 'succeeded')?.id ?? null,
    onNewComplete: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.rocketSavedPoLists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      // The dashboard's Rocket PO cell shows when the last collection completed.
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.collections() });
    },
  };
}
