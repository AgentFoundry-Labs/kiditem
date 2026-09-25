'use client';

import {
  WING_CATALOG_DETAILS_KIND,
  WING_CATALOG_EXCEL_KIND,
  WING_CATALOG_KINDS,
  WING_CATALOG_LIST_KIND,
  WingCatalogExcelResultSchema,
  type WingCatalogExcelResult,
} from '@kiditem/shared/coupang-catalog-snapshot';
import {
  OperationFinishResponseSchema,
  OperationListResponseSchema,
  type OperationListResponse,
  type OperationView,
} from '@kiditem/shared/operation';
import type { QueryKey } from '@tanstack/react-query';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { requestOperationCancel, requestOperationStart, type OperationStartOutcome } from '@/lib/operation-start';
import { queryKeys } from '@/lib/query-keys';

const RUNNING_POLL_MS = 2_000;
/** 한 화면이 보는 최근 실행 수. 계정 하나의 동기화는 목록 → 상세 둘이다. */
const RECENT_LIMIT = 5;
const OPERATIONS_PATH = `/api/operations?kinds=${WING_CATALOG_KINDS.join(',')}&limit=${RECENT_LIMIT}`;

export type WingCatalogAccount = Readonly<{ id: string; name: string | null }>;

function live(operation: OperationView): boolean {
  return operation.status === 'executing' || operation.status === 'prepared';
}

/** 이 계정의 Wing 카탈로그 실행, 최근 것부터. 끝난 실행은 잠금을 놓으므로 plan의 계정으로 가린다. */
export function accountCatalogOperations(
  response: OperationListResponse | undefined,
  channelAccountId: string,
): OperationView[] {
  const accountId = channelAccountId.toLowerCase();
  return (response?.operations ?? []).filter((operation) => operation.plan?.channelAccountId === accountId);
}

/** 이 계정에서 지금 도는 실행(목록·상세·엑셀 중 하나 — 계정 잠금이 하나만 허락한다). */
export function runningCatalogOperation(operations: readonly OperationView[]): OperationView | null {
  return operations.find(live) ?? null;
}

/**
 * 조직의 최근 Wing 카탈로그 실행 reader(`GET /api/operations`). 모든 상품 받기 컨트롤·진행 표시가 같은 읽기를
 * 계정별로 나눠 본다. 도는 실행이 있을 때만 2초마다 다시 읽는다.
 */
export function wingCatalogOperationsQueryOptions() {
  return collectionSourceStatusQueryOptions<OperationListResponse, Error, OperationListResponse, QueryKey>({
    queryKey: queryKeys.wingCatalogOperations.recent(),
    queryFn: async () => OperationListResponseSchema.parse(await apiClient.get(OPERATIONS_PATH)),
    refetchInterval: (query) =>
      query.state.data?.operations.some(live) ? RUNNING_POLL_MS : false,
    meta: { suppressGlobalErrorToast: true },
  });
}

function startOutcome(outcome: OperationStartOutcome) {
  if (outcome.outcome === 'refused') return outcome;
  return { outcome: outcome.outcome, attemptId: outcome.operationId };
}

/**
 * 스토어 계정 하나의 상품 받기(= Wing 카탈로그 동기화, KID-354). 확장이 목록 kind를 begin하고, 목록이 끝나면 서버가
 * 정한 상세 대상으로 상세 kind를 잇는다. 화면은 실행을 열지 않고, 진행은 실행 reader로 본다. 중단은 이 브라우저의
 * 실행을 멈추고(`operation.cancel`) 서버 실행을 취소한다 — 웹 탭을 닫아도 동기화는 계속된다(사용자 결정 2026-09-25).
 */
export function wingCatalogCollection(
  account: WingCatalogAccount,
): CollectionSourceAdapter<OperationListResponse> {
  return {
    sourceKey: `channels.wing_catalog:${account.id}`,
    label: '쿠팡 상품 받기',
    statusQuery: wingCatalogOperationsQueryOptions(),
    readRunning: (status) => {
      const running = runningCatalogOperation(accountCatalogOperations(status, account.id));
      return running ? { attemptId: running.id, scopeLabel: account.name } : null;
    },
    readProgress: (status) => {
      const running = runningCatalogOperation(accountCatalogOperations(status, account.id));
      return running ? `${running.id}:${JSON.stringify(running.progress ?? null)}` : null;
    },
    // 비교는 `!==`라 문자열이어야 한다.
    readStatusIdentity: (status) =>
      accountCatalogOperations(status, account.id).map((operation) => `${operation.id}:${operation.status}`).join(','),
    start: async () => startOutcome(await requestOperationStart(WING_CATALOG_LIST_KIND, { channelAccountId: account.id })),
    cancelInExtension: (operationId) => requestOperationCancel(operationId),
    cancelOnServer: (operationId) => apiClient.post(`/api/operations/${encodeURIComponent(operationId)}/cancel`),
    readCompleteId: (status) =>
      accountCatalogOperations(status, account.id).find((operation) => operation.status === 'succeeded')?.id ?? null,
    // 끝난 실행은 카탈로그 화면·readiness가 읽는 것을 새로 쓴다.
    onNewComplete: (queryClient) => {
      for (const queryKey of [
        queryKeys.channelListings.all,
        queryKeys.products.operations.all,
        queryKeys.channelProductMappings.all,
        queryKeys.channelSkuAvailability.all,
        ['readiness'],
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  };
}

/**
 * 상품 하나 상세 다시 받기(KID-351 작업 ③): 목록 없이 상세 kind를 그 상품 하나로 직접 시작한다.
 */
export function refetchWingCatalogProduct(channelAccountId: string, externalProductId: string) {
  return requestOperationStart(WING_CATALOG_DETAILS_KIND, {
    channelAccountId,
    detailTargetProductIds: [externalProductId],
    absentProductIds: [],
  });
}

export type WingCatalogWorkbookUpload = Readonly<{
  /** 같은 파일을 이 계정에 이미 반영했다 — 서버가 다시 쓰지 않았다. */
  duplicate: boolean;
  operationId: string | null;
  changes: WingCatalogExcelResult;
}>;

const NO_CHANGES: WingCatalogExcelResult = {
  createdProductCount: 0,
  updatedProductCount: 0,
  createdSkuCount: 0,
  updatedSkuCount: 0,
  skippedRowCount: 0,
};

/**
 * [쿠팡상품정보] 엑셀 업로드 = `channels.wing_catalog_excel` 실행 하나(KID-351). 응답은 `{ operation }`이고 반영 수는
 * `operation.result`다. 같은 파일 재업로드는 서버가 거절한다(`DB_CONFLICT file_already_applied`) — 그것을 "이미
 * 가져왔다"로 돌려준다.
 */
export async function uploadWingCatalogWorkbook(channelAccountId: string, file: File): Promise<WingCatalogWorkbookUpload> {
  const form = new FormData();
  form.append('file', file);
  try {
    const { operation } = await apiClient.uploadParsed(
      `/api/channels/accounts/${encodeURIComponent(channelAccountId)}/catalog-imports/coupang-wing`,
      OperationFinishResponseSchema,
      form,
    );
    return { duplicate: false, operationId: operation.id, changes: WingCatalogExcelResultSchema.parse(operation.result) };
  } catch (error) {
    if (isApiError(error) && error.code === 'DB_CONFLICT' && error.details.reason === 'file_already_applied') {
      return { duplicate: true, operationId: null, changes: NO_CHANGES };
    }
    throw error;
  }
}

export { WING_CATALOG_EXCEL_KIND, WING_CATALOG_LIST_KIND };
