'use client';

import {
  OrderCollectionSourceStatusSchema,
  type OrderCollectionSourceStatus,
} from '@kiditem/shared/order-collection-source';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { sendBrowserCollectionControl } from '@/lib/browser-collection-session';
import { attemptInProgress, startWebOpenedCollection } from '@/lib/collection-start';
import { queryKeys } from '@/lib/query-keys';
import {
  beginCoupangDirectAttempt,
  type CoupangDirectOwnerAttemptControl,
} from './coupang-directship-source-owner';
import {
  detectOrderCollectionSessionExtensionStatus,
  orderCollectionExtensionUnavailableMessage,
} from './order-collection-extension';

const PATH = '/api/orders/collection/coupang-directship';
const SOURCE_IDLE_POLL_MS = 60_000;

export type CoupangDirectshipHandoff = Readonly<{
  extensionId: string;
  attempt: CoupangDirectOwnerAttemptControl;
}>;

export function readCoupangDirectshipSource(
  channelAccountId: string,
): Promise<OrderCollectionSourceStatus> {
  return apiClient.getParsed(
    `${PATH}/source?channelAccountId=${encodeURIComponent(channelAccountId)}`,
    OrderCollectionSourceStatusSchema,
  );
}

/** The owner's operator stop, without the extension's fence token (KID-159). */
export function cancelCoupangDirectshipAttempt(attemptId: string) {
  return apiClient.post(`${PATH}/attempts/${encodeURIComponent(attemptId)}/cancel`);
}

/**
 * 화면이 아직 자기 손으로 여는 직배송 시작(입고예정일 달력과 그 달력이 고른
 * 날짜의 수집)이 owner 에게 409 를 받았을 때. 진행 중인 수집은 실패가 아니므로
 * (KID-106 Q6) 오류로 알리지 않고, 카드의 공용 컨트롤이 그 수집을 곧바로 그리도록
 * owner 상태를 다시 읽는다.
 */
export function coupangDirectshipStartAlreadyRunning(
  queryClient: QueryClient,
  channelAccountId: string | null,
  error: unknown,
): boolean {
  if (!attemptInProgress(error)) return false;
  void queryClient.invalidateQueries({
    queryKey: queryKeys.orders.coupangDirectshipSource(channelAccountId ?? ''),
    exact: true,
  });
  return true;
}

async function detectDirectshipExtension(): Promise<string> {
  const status = await detectOrderCollectionSessionExtensionStatus();
  if (status.status !== 'ready') {
    throw new Error(orderCollectionExtensionUnavailableMessage(status));
  }
  return status.extensionId;
}

/**
 * Coupang directship order collection for the shared control. One Rocket
 * account collects at a time; the owner's account-scoped status read is what
 * every browser sees as running, so the calendar's own start shows up here too
 * and can be stopped from any tab.
 *
 * 이 시작은 입력을 읽지 않는다. 시작 입력 타입을 `unknown` 으로 두어, 몰 카드처럼
 * 제 입력을 실어 보내는 컨트롤도 이 원천을 그대로 담을 수 있다(KID-214).
 */
export function coupangDirectshipCollectionSource({
  channelAccountId,
  handOff,
  abortLocalRun,
}: Readonly<{
  channelAccountId: string | null;
  /** The directship extension procedure, which runs the capture to the end. */
  handOff: (handoff: CoupangDirectshipHandoff) => Promise<void>;
  /** Ends this browser's procedure for the attempt the operator is stopping. */
  abortLocalRun?: (attemptId: string) => void;
}>): CollectionSourceAdapter<OrderCollectionSourceStatus, unknown> {
  return {
    sourceKey: `orders.coupang_directship:${channelAccountId ?? ''}`,
    label: '쿠팡 직배송 주문 수집',
    statusQuery: collectionSourceStatusQueryOptions<
      OrderCollectionSourceStatus,
      Error,
      OrderCollectionSourceStatus,
      QueryKey
    >({
      queryKey: queryKeys.orders.coupangDirectshipSource(channelAccountId ?? ''),
      queryFn: () => readCoupangDirectshipSource(channelAccountId ?? ''),
      enabled: Boolean(channelAccountId),
      refetchInterval: SOURCE_IDLE_POLL_MS,
      refetchIntervalInBackground: false,
      meta: { suppressGlobalErrorToast: true },
    }),
    readRunning: (status) =>
      status.running ? { attemptId: status.running.attemptId, scopeLabel: null } : null,
    // Without a chosen Rocket account there is nothing to collect for; the
    // control then shows only what the owner already has.
    ...(channelAccountId
      ? {
        start: () => {
          let opened: CoupangDirectOwnerAttemptControl | null = null;
          return startWebOpenedCollection({
            detectExtension: detectDirectshipExtension,
            begin: async (idempotencyKey) => {
              const started = await beginCoupangDirectAttempt(idempotencyKey, channelAccountId);
              opened = started;
              return {
                outcome: 'opened',
                attemptId: started.attemptId,
                running: started.state === 'RUNNING',
              };
            },
            handOff: ({ extensionId }) => {
              if (!opened) throw new Error('쿠팡 직배송 수집 시도를 찾지 못했습니다.');
              return handOff({ extensionId, attempt: opened });
            },
            cancel: ({ attemptId }) => cancelCoupangDirectshipAttempt(attemptId),
          });
        },
      }
      : {}),
    cancelInExtension: (attemptId) => {
      // 이 브라우저가 돌리던 절차부터 끊는다. 서버 취소만으로는 페이지 루프가 계속 돈다.
      abortLocalRun?.(attemptId);
      return sendBrowserCollectionControl(attemptId, 'cancelCollectionSession');
    },
    cancelOnServer: cancelCoupangDirectshipAttempt,
    readCompleteId: (status) => status.lastComplete?.attemptId ?? null,
    onNewComplete: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.stats() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.pipelines() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.collections() });
    },
  };
}
