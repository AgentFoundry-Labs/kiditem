'use client';

// Wing 일별 트래픽 = 실행 kind `advertising.wing_traffic`(ADR-0025, KID-362).
// 확장이 서비스워커에서 Wing 매출분석을 날마다 읽어 청크를 올리고, 서버 owner가 finish 트랜잭션에서 listing-day 트래픽을
// 쓴다. 화면은 확장에 `operation.start`만 보내고, 진행·결과는 실행 reader(`GET /api/operations`)로 본다.

import { WING_TRAFFIC_KIND, WingTrafficProgressSchema, WingTrafficResultSchema } from '@kiditem/shared/advertising-operations';
import { businessDateKey, evidenceCutoffDate } from '@kiditem/shared/common';
import { OperationListResponseSchema, type OperationView } from '@kiditem/shared/operation';
import type { QueryKey } from '@tanstack/react-query';
import { z } from 'zod';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { requestOperationCancel, requestOperationStart } from '@/lib/operation-start';
import { queryKeys } from '@/lib/query-keys';
import {
  WING_COUPANG_ACCOUNT_REQUIRED,
  WING_DAILY_OPERATION_CAPABILITY,
  readPrimaryCoupangAccountId,
} from '@/lib/wing-daily-operations';

export type WingTrafficRange = Readonly<{ startDate: string; endDate: string }>;

const RUNNING_POLL_MS = 2_000;
/** 최근 실행 몇 개를 읽는다. 첫 행이 가장 최근 실행이다. */
const RECENT_LIMIT = 10;
const OPERATIONS_PATH = `/api/operations?kinds=${WING_TRAFFIC_KIND}&limit=${RECENT_LIMIT}`;

const PlanSchema = z.object({
  channelAccountId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  expectedDates: z.array(z.string()),
}).passthrough();

export const wingTrafficSourceQueryKey = [...queryKeys.dashboard.all, 'wing-traffic-operations'] as const;

/** 대시보드 트래픽 컨트롤이 보는 상태: 대표 쿠팡 계정의 최근 트래픽 실행과 마감된 날. */
export type WingTrafficStatus = Readonly<{
  /** 마감된 마지막 KST 날(어제). 수집 범위의 끝이다. */
  knownThrough: string;
  channelAccountId: string | null;
  /** 이 계정의 실행, 최근 것부터. */
  operations: readonly OperationView[];
}>;

export type WingTrafficRun = Readonly<{
  operation: OperationView;
  range: WingTrafficRange;
  expectedDays: number;
}>;

export function formatWingTrafficRange(range: WingTrafficRange): string {
  return `${range.startDate} ~ ${range.endDate}`;
}

export function isLiveOperation(operation: OperationView): boolean {
  return operation.status === 'executing' || operation.status === 'prepared';
}

export function wingTrafficRun(operation: OperationView | null | undefined): WingTrafficRun | null {
  if (!operation) return null;
  const plan = PlanSchema.safeParse(operation.plan);
  return plan.success
    ? { operation, range: { startDate: plan.data.startDate, endDate: plan.data.endDate }, expectedDays: plan.data.expectedDates.length }
    : null;
}

/** 진행: 확정한 날 수(확장이 날마다 올린다). */
export function wingTrafficConfirmedDays(operation: OperationView): number {
  const progress = WingTrafficProgressSchema.safeParse(operation.progress);
  return progress.success ? progress.data.confirmedDays : 0;
}

/** 마지막 성공이 마감된 날까지 확정했는가. */
export function wingTrafficReady(status: WingTrafficStatus | undefined): boolean {
  const succeeded = status?.operations.find((operation) => operation.status === 'succeeded');
  const result = WingTrafficResultSchema.safeParse(succeeded?.result);
  return !!status && result.success && result.data.confirmedDates.includes(status.knownThrough);
}

async function readWingTrafficStatus(): Promise<WingTrafficStatus> {
  const [channelAccountId, list] = await Promise.all([
    readPrimaryCoupangAccountId(),
    apiClient.get<unknown>(OPERATIONS_PATH).then((body) => OperationListResponseSchema.parse(body)),
  ]);
  return {
    knownThrough: businessDateKey(evidenceCutoffDate()),
    channelAccountId,
    operations: list.operations.filter((operation) => operation.plan?.channelAccountId === channelAccountId),
  };
}

/** Wing 일별 트래픽 한 범위(마감된 KST 날짜). owner가 받은 범위를 고정하고, 도는 실행은 제 범위를 보고한다. */
export const wingTrafficCollection: CollectionSourceAdapter<WingTrafficStatus, WingTrafficRange> = {
  sourceKey: WING_TRAFFIC_KIND,
  label: 'Wing 일별 트래픽',
  statusQuery: collectionSourceStatusQueryOptions<WingTrafficStatus, Error, WingTrafficStatus, QueryKey>({
    queryKey: [...wingTrafficSourceQueryKey, 'primary'],
    queryFn: readWingTrafficStatus,
    refetchInterval: (query) => ((query.state.data?.operations ?? []).some(isLiveOperation) ? RUNNING_POLL_MS : false),
    refetchIntervalInBackground: false,
    meta: { suppressGlobalErrorToast: true },
  }),
  readRunning: (status) => {
    const running = wingTrafficRun(status.operations.find(isLiveOperation));
    return running ? { attemptId: running.operation.id, scopeLabel: formatWingTrafficRange(running.range) } : null;
  },
  readProgress: (status) => {
    const running = status.operations.find(isLiveOperation);
    return running ? `${running.id}:${JSON.stringify(running.progress ?? null)}` : null;
  },
  readStatusIdentity: (status) => status.operations.map((operation) => `${operation.id}:${operation.status}`).join(','),
  start: async (range, { status }) => {
    const channelAccountId = status?.channelAccountId ?? (await readPrimaryCoupangAccountId());
    if (!channelAccountId) throw new Error(WING_COUPANG_ACCOUNT_REQUIRED);
    const outcome = await requestOperationStart(
      WING_TRAFFIC_KIND,
      { channelAccountId, startDate: range.startDate, endDate: range.endDate },
      { capability: WING_DAILY_OPERATION_CAPABILITY },
    );
    if (outcome.outcome === 'refused') return outcome;
    return { outcome: outcome.outcome, attemptId: outcome.operationId };
  },
  cancelInExtension: (operationId) => requestOperationCancel(operationId),
  cancelOnServer: (operationId) => apiClient.post(`/api/operations/${encodeURIComponent(operationId)}/cancel`),
  readCompleteId: (status) => status.operations.find((operation) => operation.status === 'succeeded')?.id ?? null,
  // 끝난 범위는 대시보드 읽기 모델이 모으는 트래픽을 새로 쓴다.
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  },
};
