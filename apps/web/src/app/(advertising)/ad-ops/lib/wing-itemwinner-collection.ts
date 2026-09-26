'use client';

// Wing 아이템위너 = 실행 kind `advertising.wing_itemwinner`(ADR-0025, KID-362).
// 확장이 서비스워커에서 Wing 목록을 읽어 청크를 올리고, 서버 owner가 finish 트랜잭션에서 그날 위너 사실을 쓴다.
// 화면은 확장에 `operation.start`만 보내고, 진행·결과는 실행 reader(`GET /api/operations`)로 본다.

import { z } from 'zod';
import { WING_ITEMWINNER_KIND } from '@kiditem/shared/advertising-operations';
import { ChannelAccountListItemSchema } from '@kiditem/shared/channel-account';
import { OperationListResponseSchema, type OperationListResponse, type OperationView } from '@kiditem/shared/operation';
import type { QueryKey } from '@tanstack/react-query';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { requestOperationCancel, requestOperationStart } from '@/lib/operation-start';
import { queryKeys } from '@/lib/query-keys';

/** Wing 일별 사실 kind(트래픽·아이템위너)를 도는 확장 빌드가 `ping`에 싣는 표시(KID-362). */
export const WING_DAILY_OPERATION_CAPABILITY = 'wingDailyOperationKindsV1' as const;
export const WING_COUPANG_ACCOUNT_REQUIRED = '연결된 쿠팡 계정이 없습니다. 채널 설정에서 쿠팡 Wing 계정을 먼저 연결해 주세요.';

const RUNNING_POLL_MS = 2_000;
/** 최근 실행 몇 개를 읽는다. 첫 행이 가장 최근 실행이다. */
const RECENT_LIMIT = 5;
const OPERATIONS_PATH = `/api/operations?kinds=${WING_ITEMWINNER_KIND}&limit=${RECENT_LIMIT}`;

const PlanSchema = z.object({ businessDate: z.string() }).passthrough();

function live(operation: OperationView): boolean {
  return operation.status === 'executing' || operation.status === 'prepared';
}

/** 가장 최근 아이템위너 실행(끝났거나 도는 것). */
export function latestItemwinnerOperation(status: OperationListResponse | undefined): OperationView | null {
  return status?.operations[0] ?? null;
}

/** Wing 계정: 활성 쿠팡 계정 중 대표 계정, 없으면 첫 계정. */
export async function resolvePrimaryCoupangAccountId(): Promise<string> {
  const accounts = z.array(ChannelAccountListItemSchema).parse(await apiClient.get<unknown>('/api/channels/accounts'));
  const coupang = accounts.filter((account) => account.channel === 'coupang');
  const account = coupang.find((candidate) => candidate.isPrimary) ?? coupang[0];
  if (!account) throw new Error(WING_COUPANG_ACCOUNT_REQUIRED);
  return account.id;
}

/** 아이템위너 카드의 수집 컨트롤. 중단 = 확장 `operation.cancel` → 서버 cancel. */
export const wingItemwinnerCollection: CollectionSourceAdapter<OperationListResponse> = {
  sourceKey: WING_ITEMWINNER_KIND,
  label: 'Wing 아이템위너',
  statusQuery: collectionSourceStatusQueryOptions<OperationListResponse, Error, OperationListResponse, QueryKey>({
    queryKey: queryKeys.ads.itemwinnerOperations(),
    queryFn: async () => OperationListResponseSchema.parse(await apiClient.get(OPERATIONS_PATH)),
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
