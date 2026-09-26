'use client';

// Wing 아이템위너 = 실행 kind `advertising.wing_itemwinner`(ADR-0025, KID-362).
// 확장이 서비스워커에서 Wing 목록을 읽어 청크를 올리고, 서버 owner가 finish 트랜잭션에서 그날 위너 사실을 쓴다.
// 화면은 확장에 `operation.start`만 보내고, 진행·결과는 실행 reader(`GET /api/operations`)로 본다.

import { z } from 'zod';
import { WING_ITEMWINNER_KIND } from '@kiditem/shared/advertising-operations';
import type { OperationListResponse, OperationView } from '@kiditem/shared/operation';
import type { QueryKey } from '@tanstack/react-query';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { requestOperationCancel, requestOperationStart } from '@/lib/operation-start';
import { queryKeys } from '@/lib/query-keys';
import {
  WING_DAILY_OPERATION_CAPABILITY,
  isLiveOperation,
  refreshedOperations,
  resolvePrimaryCoupangAccountId,
} from '@/lib/wing-daily-operations';

const RUNNING_POLL_MS = 2_000;
/** 최근 실행 몇 개를 읽는다. 첫 행이 가장 최근 실행이다. */
const RECENT_LIMIT = 5;
const OPERATIONS_PATH = `/api/operations?kinds=${WING_ITEMWINNER_KIND}&limit=${RECENT_LIMIT}`;

const PlanSchema = z.object({ businessDate: z.string() }).passthrough();

const live = isLiveOperation;

/** 가장 최근 아이템위너 실행(끝났거나 도는 것). */
export function latestItemwinnerOperation(status: OperationListResponse | undefined): OperationView | null {
  return status?.operations[0] ?? null;
}

/** 아이템위너 카드의 수집 컨트롤. 중단 = 확장 `operation.cancel` → 서버 cancel. */
export const wingItemwinnerCollection: CollectionSourceAdapter<OperationListResponse> = {
  sourceKey: WING_ITEMWINNER_KIND,
  label: 'Wing 아이템위너',
  statusQuery: collectionSourceStatusQueryOptions<OperationListResponse, Error, OperationListResponse, QueryKey>({
    queryKey: queryKeys.ads.itemwinnerOperations(),
    queryFn: async ({ client }) => ({ operations: await refreshedOperations(client, queryKeys.ads.itemwinnerOperations(), OPERATIONS_PATH) }),
    refetchInterval: (query) => ((query.state.data?.operations ?? []).some(live) ? RUNNING_POLL_MS : false),
    meta: { suppressGlobalErrorToast: true },
  }),
  readRunning: (status) => {
    const running = status.operations.find(live);
    if (!running) return null;
    const plan = PlanSchema.safeParse(running.plan);
    return { attemptId: running.id, scopeLabel: plan.success ? `${plan.data.businessDate} 기준` : null };
  },
  readStatusIdentity: (status) => status.operations.map((operation) => `${operation.id}:${operation.status}`).join(','),
  start: async () => {
    const channelAccountId = await resolvePrimaryCoupangAccountId();
    const outcome = await requestOperationStart(WING_ITEMWINNER_KIND, { channelAccountId }, { capability: WING_DAILY_OPERATION_CAPABILITY });
    if (outcome.outcome === 'refused') return outcome;
    return { outcome: outcome.outcome, attemptId: outcome.operationId };
  },
  cancelInExtension: (operationId) => requestOperationCancel(operationId),
  cancelOnServer: (operationId) => apiClient.post(`/api/operations/${encodeURIComponent(operationId)}/cancel`),
  readCompleteId: (status) => status.operations.find((operation) => operation.status === 'succeeded')?.id ?? null,
  // 상태 탭의 아이템위너 KPI는 광고 확장 상태 읽기(`/api/ads/extension/status`)에서 온다.
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.ads.all });
  },
};
