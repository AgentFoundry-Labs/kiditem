'use client';

// 광고 보고서 = 실행 kind `advertising.ad_report`(ADR-0025, KID-371).
// 확장이 광고센터에서 보고서 2개와 정산을 받아 청크로 올리고, 서버 owner가 finish 트랜잭션에서 광고 원장 5표를 쓴다.
// 화면은 확장에 `operation.start`만 보내고, 진행·결과는 실행 reader(`GET /api/operations`)로 본다. 폴링은 다른 수집 컨트롤과
// 같은 `refreshedOperations`(도는 실행 하나만 2초마다)라 API 제한에 새 부담을 더하지 않는다.

import { z } from 'zod';
import {
  AD_REPORT_KIND,
  ADVERTISING_AD_REPORT_OPERATION_CAPABILITY,
  AdReportResultSchema,
  type AdReportResult,
} from '@kiditem/shared/advertising-operations';
import type { OperationListResponse, OperationView } from '@kiditem/shared/operation';
import type { QueryKey } from '@tanstack/react-query';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { noteOperationLoginFailureForMall, operationLoginOptions, WING_LOGIN_MALL_KEY } from '@/lib/operation-login';
import { requestOperationCancel, requestOperationStart } from '@/lib/operation-start';
import { queryKeys } from '@/lib/query-keys';
import { isLiveOperation, refreshedOperations, resolvePrimaryCoupangAccountId } from '@/lib/wing-daily-operations';

const RUNNING_POLL_MS = 2_000;
/** 최근 실행 몇 개를 읽는다. 첫 행이 가장 최근 실행이다. */
const RECENT_LIMIT = 5;
const OPERATIONS_PATH = `/api/operations?kinds=${AD_REPORT_KIND}&limit=${RECENT_LIMIT}`;

const PlanSchema = z.object({ startDate: z.string(), endDate: z.string() }).passthrough();

/** 가장 최근 광고 보고서 실행(끝났거나 도는 것). */
export function latestAdReportOperation(status: OperationListResponse | undefined): OperationView | null {
  return status?.operations[0] ?? null;
}

/** 성공한 실행의 결과. 모양이 다르면 null(화면은 결과 줄을 숨긴다). */
export function adReportResult(operation: OperationView | null): AdReportResult | null {
  if (operation?.status !== 'succeeded') return null;
  const parsed = AdReportResultSchema.safeParse(operation.result);
  return parsed.success ? parsed.data : null;
}

/** "정산 대조 경고 n건 · 정산 미확인 n일" — 0인 쪽은 뺀다. 둘 다 0이면 null. */
export function adReportWarningText(result: AdReportResult): string | null {
  const parts = [
    result.warnings.length > 0 ? `정산 대조 경고 ${result.warnings.length}건` : null,
    result.unsettledCampaignDays > 0 ? `정산 미확인 ${result.unsettledCampaignDays}일` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** 광고 보고서 수집 컨트롤. 중단 = 확장 `operation.cancel` → 서버 cancel. */
export const adReportCollection: CollectionSourceAdapter<OperationListResponse> = {
  sourceKey: AD_REPORT_KIND,
  label: '광고 보고서',
  statusQuery: collectionSourceStatusQueryOptions<OperationListResponse, Error, OperationListResponse, QueryKey>({
    queryKey: queryKeys.ads.adReportOperations(),
    queryFn: async ({ client }) => {
      const operations = await refreshedOperations(client, queryKeys.ads.adReportOperations(), OPERATIONS_PATH);
      // 광고센터는 쿠팡 윙과 같은 저장 자격으로 로그인한다. 그 자격이 거절됐으면 윙 자동 로그인을 멈춘다(계정 잠금 방지, KID-377).
      if (operations[0]) noteOperationLoginFailureForMall(WING_LOGIN_MALL_KEY, operations[0]);
      return { operations };
    },
    refetchInterval: (query) => ((query.state.data?.operations ?? []).some(isLiveOperation) ? RUNNING_POLL_MS : false),
    meta: { suppressGlobalErrorToast: true },
  }),
  readRunning: (status) => {
    const running = status.operations.find(isLiveOperation);
    if (!running) return null;
    const plan = PlanSchema.safeParse(running.plan);
    return { attemptId: running.id, scopeLabel: plan.success ? `${plan.data.startDate} ~ ${plan.data.endDate}` : null };
  },
  readStatusIdentity: (status) => status.operations.map((operation) => `${operation.id}:${operation.status}`).join(','),
  start: async () => {
    const channelAccountId = await resolvePrimaryCoupangAccountId();
    // 광고센터 로그인 폼은 윙과 같은 두 칸이라 대표 윙 계정의 저장 자격을 싣는다(operationLoginV1 빌드만 받는다).
    const outcome = await requestOperationStart(AD_REPORT_KIND, { channelAccountId }, {
      capability: ADVERTISING_AD_REPORT_OPERATION_CAPABILITY,
      ...(await operationLoginOptions(WING_LOGIN_MALL_KEY)),
    });
    if (outcome.outcome === 'refused') return outcome;
    return { outcome: outcome.outcome, attemptId: outcome.operationId };
  },
  cancelInExtension: (operationId) => requestOperationCancel(operationId),
  cancelOnServer: (operationId) => apiClient.post(`/api/operations/${encodeURIComponent(operationId)}/cancel`),
  readCompleteId: (status) => status.operations.find((operation) => operation.status === 'succeeded')?.id ?? null,
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.ads.all });
  },
};
