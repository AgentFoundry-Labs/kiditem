'use client';

import type { OperationListResponse, OperationView } from '@kiditem/shared/operation';
import {
  isMallOrderOperationMall,
  MALL_ORDERS_KIND,
  MallOrdersResultSchema,
} from '@kiditem/shared/orders-operations';
import type { QueryKey } from '@tanstack/react-query';
import { COLLECTION_IDLE_POLL_MS } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { requestOperationCancel, requestOperationStart } from '@/lib/operation-start';
import type { OrderCollectionMallAccount } from '@/lib/order-mall-account-api';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { toastNoNewOrders, type BrowserMallCollectionResult } from './browser-mall-collection';
import type { MallOrderCollectionStartInput } from './mall-order-collection-source';
import { saveIcecreamDeliveryIndex } from './icecream-delivery-index';
import { readOrderOperationContinuation, regenerateOrderOperationSource } from './order-collection-api';
import { addSeenOrderKeys } from './order-detect';
import {
  detectOrderCollectionSessionExtensionStatus,
  orderCollectionExtensionUnavailableMessage,
} from './order-collection-extension';
import { ICECREAM_MALL_KEY, todayYmd, type ConversionHistoryItem } from './order-collection-page-model';
import type { OrderCollectionSourceAdapter } from './order-collection-source-adapter';
import {
  ORDER_CAPTURE_OPERATION_CAPABILITY,
  orderOperationsQueryKey,
  readOrderOperations,
  waitForOrderOperation,
} from './order-operations';

/**
 * 이 몰은 실행 kind `orders.mall_orders`로 수집한다(KID-359 H3 1차 몰). 나머지 몰은 옛 attempt 경로가 나머지 몰이 옮겨질 때까지 받는다.
 * 어느 경로인지는 이 원천 파일이 답한다 — 루프와 카드는 몰 키를 비교하지 않는다.
 */
export function collectsViaMallOrderOperation(mallKey: string): boolean {
  return isMallOrderOperationMall(mallKey);
}

/** 시작이 연 실행을 절차에 넘기는 것. 절차가 끝날 때까지 기다리고 변환한다. */
export type MallOrderOperationHandoff = Readonly<{
  extensionId: string;
  operationId: string;
  input: MallOrderCollectionStartInput;
  collectionDate: string;
}>;

const NOT_CONFIGURED = {
  outcome: 'refused',
  message: '설정에서 사용을 켜고 저장한 뒤 수집할 수 있습니다.',
} as const;

function forMall(mallKey: string) {
  return (operation: OperationView) => operation.plan?.mallKey === mallKey;
}

function mallOperations(status: OperationListResponse | undefined, mallKey: string): OperationView[] {
  return (status?.operations ?? []).filter(forMall(mallKey));
}

/**
 * 실행 kind로 옮긴 몰 하나의 공용 컨트롤 어댑터. 상태는 실행 reader(`GET /api/operations?kinds=orders.mall_orders`)
 * 한 읽기를 네 몰 카드가 나눠 본다(옛 몰 목록 읽기와 따로, 탭당 유휴 60초·도는 동안 2초에 한 번).
 * 시작은 옛 몰과 같이 저장된 계정으로 로그인을 먼저 맞춘 뒤(확장이 수집을 곧바로 시작하므로 그 앞에서) 확장에
 * `operation.start`를 보낸다. 중단은 이 브라우저의 절차 → 확장 `operation.cancel` → 서버 cancel.
 */
export function mallOrderOperationSource({
  organizationId,
  account,
  handOff,
  ensureLogin,
  abortLocalRun,
}: Readonly<{
  organizationId: string | null;
  account: OrderCollectionMallAccount;
  handOff: (handoff: MallOrderOperationHandoff) => Promise<void>;
  /** 저장된 아이디·비밀번호로 그 몰에 먼저 로그인해 둔다(옛 몰과 같은 차단·간격 규칙). */
  ensureLogin: (
    account: OrderCollectionMallAccount,
    run: Readonly<{ extensionId: string; selectionMode: 'manual' | 'automatic' }>,
  ) => Promise<void>;
  abortLocalRun?: (operationId: string) => void;
}>): OrderCollectionSourceAdapter<OperationListResponse> {
  const match = forMall(account.key);
  return {
    sourceKey: `orders.mall:${account.key}`,
    label: `${account.name} 주문 수집`,
    card: { opensChooser: false, startBlockedReason: null },
    statusQuery: collectionSourceStatusQueryOptions<OperationListResponse, Error, OperationListResponse, QueryKey>({
      queryKey: orderOperationsQueryKey(MALL_ORDERS_KIND),
      queryFn: () => readOrderOperations(MALL_ORDERS_KIND),
      enabled: Boolean(organizationId),
      refetchInterval: COLLECTION_IDLE_POLL_MS,
      refetchIntervalInBackground: false,
      meta: { suppressGlobalErrorToast: true },
    }),
    readRunning: (status) => {
      const running = mallOperations(status, account.key)
        .find((operation) => operation.status === 'executing' || operation.status === 'prepared');
      return running ? { attemptId: running.id, scopeLabel: account.name } : null;
    },
    readStatusIdentity: (status) =>
      mallOperations(status, account.key).map((operation) => `${operation.id}:${operation.status}`).join(','),
    start: async (input) => {
      if (!account.channelAccountId) return NOT_CONFIGURED;
      const extension = await detectOrderCollectionSessionExtensionStatus();
      if (extension.status !== 'ready') throw new Error(orderCollectionExtensionUnavailableMessage(extension));
      const selectionMode = input.selectionMode ?? 'manual';
      await ensureLogin(account, { extensionId: extension.extensionId, selectionMode });
      const collectionDate = input.collectionDate ?? todayYmd();
      const outcome = await requestOperationStart(MALL_ORDERS_KIND, {
        channelAccountId: account.channelAccountId,
        mallKey: account.key,
        collectionDate,
        collectionMode: 'browser',
        selectionMode,
        ...(input.seenRowKeys ? { seenRowKeys: [...input.seenRowKeys] } : {}),
      }, { capability: ORDER_CAPTURE_OPERATION_CAPABILITY });
      if (outcome.outcome === 'refused') return outcome;
      if (outcome.outcome === 'running') return { outcome: 'running', attemptId: outcome.operationId };
      await handOff({ extensionId: extension.extensionId, operationId: outcome.operationId, input, collectionDate });
      return { outcome: 'started', attemptId: outcome.operationId };
    },
    cancelInExtension: (operationId) => {
      abortLocalRun?.(operationId);
      return requestOperationCancel(operationId);
    },
    cancelOnServer: (operationId) => apiClient.post(`/api/operations/${encodeURIComponent(operationId)}/cancel`),
    readCompleteId: (status) =>
      (status.operations ?? []).find((operation) => match(operation) && operation.status === 'succeeded')?.id ?? null,
    onNewComplete: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.stats() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.pipelines() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.collections() });
    },
  };
}

/**
 * 시작이 연 실행 하나의 나머지: 끝날 때까지 기다리고, 성공이면 실행 id로 다시 변환해(서버가 보관 캡처를 변환한다)
 * 생성 파일을 남긴다. 주문이 없던 수집은 변환하지 않는다. 실패는 `OrderOperationFailure`로 올라가 몰 카드가
 * 로그인 필요·인증 필요·실패를 가른다.
 */
export async function collectMallOrderOperation({
  account,
  operationId,
  collectionDate,
  addGeneratedFile,
  signal,
  sleep,
}: Readonly<{
  account: OrderCollectionMallAccount;
  operationId: string;
  collectionDate: string;
  addGeneratedFile: (historyItem: ConversionHistoryItem) => void;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}>): Promise<BrowserMallCollectionResult> {
  const operation = await waitForOrderOperation(MALL_ORDERS_KIND, operationId, {
    source: 'order_collection_mall',
    // 옛 확장 응답 제한과 같다(도매꾹은 엑셀 생성을 기다린다).
    timeoutMs: account.key === 'domeggook' ? 260_000 : 200_000,
    ...(signal ? { signal } : {}),
    ...(sleep ? { sleep } : {}),
  });
  const parsed = MallOrdersResultSchema.safeParse(operation.result);
  const result = parsed.success ? parsed.data : null;
  const masked = result?.masked === true;
  // 아이스크림몰은 원본 행이 있으면(고른 행이 없어도) 송장 업로드용 배송 색인을 만든다.
  const continuation = account.key === ICECREAM_MALL_KEY ? await readOrderOperationContinuation(operationId) : null;
  if (continuation && continuation.originalRows.length > 0) saveIcecreamDeliveryIndex(continuation.headers, continuation.originalRows);
  // 캡처가 비었으면 변환할 것이 없다. 캡처가 있어도 변환기가 신규 주문이 없다고 하면 서버가 파일 없이(204) 답한다.
  const converted = result?.captured === 0 ? null : await regenerateOrderOperationSource(operationId, { download: false });
  if (!converted || (converted.outputRows ?? 0) === 0) {
    toastNoNewOrders(account.name);
    return { rowCount: 0, masked, date: collectionDate };
  }
  const collectedRows = converted.sourceRows ?? result?.rowCount ?? 0;
  const convertedAt = Date.now();
  addGeneratedFile({
    ...converted,
    id: `${convertedAt}-${account.key}-browser`,
    sourceName: `${account.name} 브라우저 수집 (${formatNumber(collectedRows)}행)`,
    convertedAt,
    collectionDate,
    collectionMode: 'browser',
    collectedRows,
    mallKey: account.key,
    mallName: account.name,
    // 일일 건수·중복 판정이 쓰는 주문번호(서버가 고른 행에서 뽑은 것, 최대 2,000개).
    ...(result?.orderNumbers ? { orderNumbers: result.orderNumbers } : {}),
  });
  // 이번에 고른 행을 다음 자동 선택의 본 행으로 적는다.
  if (continuation && continuation.selectedRowKeys.length > 0) addSeenOrderKeys(account.key, continuation.selectedRowKeys);
  return { rowCount: collectedRows, masked, date: collectionDate };
}
