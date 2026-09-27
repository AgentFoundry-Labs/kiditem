'use client';

import { OperationFinishResponseSchema, type OperationListResponse, type OperationView } from '@kiditem/shared/operation';
import {
  isMallOrdersManualUploadMall,
  mallOrderSiteCapability,
  MALL_ORDERS_KIND,
  MallOrdersResultSchema,
} from '@kiditem/shared/orders-operations';
import type { QueryKey } from '@tanstack/react-query';
import { COLLECTION_IDLE_POLL_MS } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { mallAutoLoginBlock } from '@/lib/mall-login-block';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { loadOperationLoginCredentials, noteOperationLoginFailure, type OperationLoginCredentials } from '@/lib/operation-login';
import { requestOperationCancel, requestOperationStart } from '@/lib/operation-start';
import type { OrderCollectionMallAccount } from '@/lib/order-mall-account-api';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import { toastNoNewOrders, type BrowserMallCollectionResult } from './browser-mall-collection';
import { collectsViaOrderAttempt, type MallOrderCollectionStartInput } from './mall-order-collection-source';
import { saveIcecreamDeliveryIndex } from './icecream-delivery-index';
import {
  readOrderOperationContinuation,
  regenerateOrderOperationSource,
  type OrderCollectionConversionResult,
} from './order-collection-api';
import { addSeenOrderKeys } from './order-detect';
import {
  detectOrderCollectionSessionExtensionStatus,
  orderCollectionExtensionUnavailableMessage,
} from './order-collection-extension';
import { ICECREAM_MALL_KEY, todayYmd, type ConversionHistoryItem } from './order-collection-page-model';
import type { OrderCollectionSourceAdapter } from './order-collection-source-adapter';
import {
  OrderOperationFailure,
  orderOperationsQueryKey,
  readOrderOperations,
  waitForOrderOperation,
} from './order-operations';

/**
 * 이 몰은 실행 kind `orders.mall_orders`로 수집한다 — 옛 attempt 경로에 남은 카카오(KID-379)가 아니면 모두다.
 * 어느 경로인지는 원천 파일이 답한다 — 루프와 카드는 몰 키를 비교하지 않는다.
 */
export function collectsViaMallOrderOperation(mallKey: string): boolean {
  return !collectsViaOrderAttempt(mallKey);
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

/** 로그인 폼 채우기(15초)와 탭 이동(로그인 뒤 돌아가기 포함 60초) — 사이트 읽기 제한 위에 얹는다. */
const LOGIN_AND_NAVIGATION_MS = 75_000;
/** 옛 확장 응답 제한. 몰 실행 기다림은 이보다 짧지 않다. */
const MIN_OPERATION_WAIT_MS = 200_000;
/**
 * 엑셀·blob 몰마다 확장 사이트의 읽기 제한(`extensions/src/sites/<mall>`의 READ_TIMEOUT_MS). GS샵은 읽기 → SMS 인증을
 * 운영자가 마칠 때까지 최대 10분(`waitForOperator`) → 배송관리로 돌아가기 30초 → 다시 읽기다(KID-380 T2).
 */
const MALL_READ_MS: Readonly<Record<string, number>> = {
  kkomangse: 90_000,
  'teacher-mall': 120_000,
  boribori: 120_000,
  always: 120_000,
  'lotte-on': 120_000,
  'gs-shop': 140_000 + 600_000 + 30_000 + 140_000,
};
/**
 * 정해 둔 한도: 도매꾹은 엑셀 생성을, 키즈노트(읽기 190초)·해법몰(180초)은 읽기 위에 실행 안 로그인(폼 15초 + 이동 30초 두 번)을
 * 더 기다린다(KID-380 T1). 여기에도 표에도 없는 몰(1차 셋·온채널)은 옛 확장 응답 제한 200초다.
 */
const FIXED_WAIT_MS: Readonly<Record<string, number>> = { domeggook: 260_000, kidsnote: 260_000, 'haebub-mall': 260_000 };

/** 웹이 몰 실행 하나를 기다리는 시간. 사이트가 운영자를 기다리는 동안 먼저 포기하지 않게 사이트 제한에서 계산한다. */
export function mallOrderOperationWaitMs(mallKey: string): number {
  return FIXED_WAIT_MS[mallKey] ?? Math.max(MIN_OPERATION_WAIT_MS, (MALL_READ_MS[mallKey] ?? 0) + LOGIN_AND_NAVIGATION_MS);
}

/** 도는 실행이 운영자를 기다리면(`progress.attention`, 확장 `attentionReporter`) 카드 안내. 아니면 null. */
export function mallOrderAttentionText(operation: OperationView | null, mallName: string): string | null {
  const attention = operation?.progress?.attention;
  if (!attention || typeof attention !== 'object' || Array.isArray(attention)) return null;
  const { kind, label } = attention as Record<string, unknown>;
  if (kind !== 'verification') return null;
  const step = typeof label === 'string' && label ? label : '인증';
  return `${mallName} 탭에서 ${step}을 마쳐 주세요 — 마치면 자동으로 이어집니다`;
}

function forMall(mallKey: string) {
  return (operation: OperationView) => operation.plan?.mallKey === mallKey;
}

function mallOperations(status: OperationListResponse | undefined, mallKey: string): OperationView[] {
  return (status?.operations ?? []).filter(forMall(mallKey));
}

/**
 * 실행 kind로 옮긴 몰 하나의 공용 컨트롤 어댑터. 상태는 실행 reader(`GET /api/operations?kinds=orders.mall_orders`)
 * 한 읽기를 네 몰 카드가 나눠 본다(옛 몰 목록 읽기와 따로, 탭당 유휴 60초·도는 동안 2초에 한 번).
 * 시작은 그 몰의 저장 자격을 `operation.start`에 실어 보내고, 확장이 실행 안에서 로그인 화면을 만나면 그 자격으로
 * 로그인한다(KID-377). 보낼지는 옛 몰과 같은 차단·한 시간 간격 규칙이 정한다(`operation-login`). 중단은 이 브라우저의
 * 절차 → 확장 `operation.cancel` → 서버 cancel.
 */
export function mallOrderOperationSource({
  organizationId,
  account,
  handOff,
  loadLoginCredentials = loadOperationLoginCredentials,
  abortLocalRun,
}: Readonly<{
  organizationId: string | null;
  account: OrderCollectionMallAccount;
  handOff: (handoff: MallOrderOperationHandoff) => Promise<void>;
  /** 실어 보낼 저장 자격(차단·간격 규칙을 지난 것). 없으면 자격 없이 연다. */
  loadLoginCredentials?: (
    account: OrderCollectionMallAccount,
    options: { automatic: boolean },
  ) => Promise<OperationLoginCredentials | undefined>;
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
    readAttention: (status) => mallOrderAttentionText(
      mallOperations(status, account.key).find((operation) => operation.status === 'executing' || operation.status === 'prepared') ?? null,
      account.name,
    ),
    readStatusIdentity: (status) =>
      mallOperations(status, account.key).map((operation) => `${operation.id}:${operation.status}`).join(','),
    start: async (input) => {
      if (!account.channelAccountId) return NOT_CONFIGURED;
      const extension = await detectOrderCollectionSessionExtensionStatus();
      if (extension.status !== 'ready') throw new Error(orderCollectionExtensionUnavailableMessage(extension));
      const selectionMode = input.selectionMode ?? 'manual';
      const credentials = await loadLoginCredentials(account, { automatic: selectionMode === 'automatic' });
      const collectionDate = input.collectionDate ?? todayYmd();
      const outcome = await requestOperationStart(MALL_ORDERS_KIND, {
        channelAccountId: account.channelAccountId,
        mallKey: account.key,
        collectionDate,
        collectionMode: 'browser',
        selectionMode,
        ...(input.seenRowKeys ? { seenRowKeys: [...input.seenRowKeys] } : {}),
      // 그 몰 사이트를 가진 빌드에만 보낸다 — 옛 빌드는 서버가 실행을 연 뒤 RUNTIME_PLAN_INVALID로 끝났다(KID-380 T4).
      }, {
        capability: mallOrderSiteCapability(account.key),
        ...(credentials ? { credentials } : {}),
        // 막힌 몰이라 자격을 싣지 않았다 — 멈춘 실행의 까닭을 blocked로 적게 한다(실기기 R7).
        ...(!credentials && mallAutoLoginBlock(account.key) ? { loginBlocked: true } : {}),
      });
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
type MallOrderOperationCollectInput = Readonly<{
  account: OrderCollectionMallAccount;
  operationId: string;
  collectionDate: string;
  addGeneratedFile: (historyItem: ConversionHistoryItem) => void;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}>;

export async function collectMallOrderOperation({
  account,
  operationId,
  collectionDate,
  addGeneratedFile,
  signal,
  sleep,
  timeoutMs,
  pollMs,
}: MallOrderOperationCollectInput & Readonly<{ timeoutMs?: number; pollMs?: number }>): Promise<BrowserMallCollectionResult> {
  const operation = await waitForOrderOperation(MALL_ORDERS_KIND, operationId, {
    source: 'order_collection_mall',
    // 사이트 제한에서 계산한다 — GS샵은 SMS 인증을 운영자가 마칠 때까지 기다린다(KID-380).
    timeoutMs: timeoutMs ?? mallOrderOperationWaitMs(account.key),
    ...(pollMs ? { pollMs } : {}),
    ...(signal ? { signal } : {}),
    ...(sleep ? { sleep } : {}),
  }).catch((error: unknown) => {
    // 몰이 저장된 아이디·비밀번호를 거부했으면 더 두드리지 않는다(KID-377).
    if (error instanceof OrderOperationFailure) noteOperationLoginFailure(account, error.operation);
    throw error;
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

/** 기다림이 끝난 뒤 이어 읽는 상한 — 실행 임대(30분)와 같다. */
export const MALL_ORDER_FOLLOW_UP_MS = 30 * 60_000;
/**
 * 이어 읽는 간격. 몰 하나에 분당 네 번이다 — 몰 27곳이 한꺼번에 기다림을 넘겨도 탭당 분당 108번으로 API 제한(600) 안이다.
 */
export const MALL_ORDER_FOLLOW_UP_POLL_MS = 15_000;

/**
 * 화면의 기다림 상한이 지나 `OrderOperationStillRunning`으로 끝난 실행을 이어 읽는다(KID-380 D7). 실행이 끝나면
 * `collectMallOrderOperation`과 같은 길로 결과를 낸다 — 성공이면 변환해 생성 파일을 남기고, 실패면 `OrderOperationFailure`.
 * 화면은 이 결과로 "아직 끝나지 않았습니다" 활동 행을 바꿔 적는다.
 */
export function followUpMallOrderOperation(input: MallOrderOperationCollectInput): Promise<BrowserMallCollectionResult> {
  return collectMallOrderOperation({ ...input, timeoutMs: MALL_ORDER_FOLLOW_UP_MS, pollMs: MALL_ORDER_FOLLOW_UP_POLL_MS });
}

/**
 * 수동 엑셀 업로드(KID-380 T4): 파일(과 엑셀 암호)을 그 몰의 업로드 라우트에 올리면 서버가 `orders.mall_orders`
 * 실행 하나(`collectionMode: 'manual-upload'`)를 돌린다. 화면은 그 실행 id로 기다린 뒤 실행 id로 변환 파일을 받는다 —
 * attempt도, 브라우저에 남기는 시도 힌트도 없다. 변환기가 신규 주문이 없다고 하면(204) null.
 */
export async function uploadMallOrderFile({
  account,
  file,
  password,
  sleep,
}: Readonly<{
  account: OrderCollectionMallAccount;
  file: File;
  password?: string;
  sleep?: (ms: number) => Promise<void>;
}>): Promise<(OrderCollectionConversionResult & { operationId: string }) | null> {
  if (!isMallOrdersManualUploadMall(account.key)) {
    throw new Error(`${account.name} 업로드 변환은 아직 준비 중입니다.`);
  }
  const form = new FormData();
  form.append('file', file);
  if (password) form.append('password', password);
  const { operation } = await apiClient.uploadParsed(
    `/api/orders/collection/malls/${encodeURIComponent(account.key)}/upload`,
    OperationFinishResponseSchema,
    form,
  );
  const done = await waitForOrderOperation(MALL_ORDERS_KIND, operation.id, {
    source: 'order_collection_mall',
    ...(sleep ? { sleep } : {}),
  });
  const converted = await regenerateOrderOperationSource(done.id);
  if (converted.outputRows === 0 || converted.blob.size === 0) return null;
  return { ...converted, operationId: done.id };
}
