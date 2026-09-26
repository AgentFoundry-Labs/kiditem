'use client';

import type { OrderCollectionSourceStatus } from '@kiditem/shared/order-collection-source';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { COLLECTION_IDLE_POLL_MS, COLLECTION_RUNNING_POLL_MS } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { attemptInProgress, startWebOpenedCollection } from '@/lib/collection-start';
import { requestOperationCancel } from '@/lib/operation-start';
import { queryKeys } from '@/lib/query-keys';
import {
  beginCoupangDirectAttempt,
  directshipAttemptView,
  readRecentCoupangDirectOperations,
  type CoupangDirectOwnerAttemptControl,
} from './coupang-directship-source-owner';
import {
  detectOrderCollectionSessionExtensionStatus,
  orderCollectionExtensionUnavailableMessage,
} from './order-collection-extension';
import type { OrderCollectionSourceAdapter } from './order-collection-source-adapter';

/**
 * 쿠팡 직배송 owner 가 수집하는 몰. 주문수집 화면에서 이 키를 아는 곳은 여기 하나다 —
 * 루프도 화면도 몰 키를 비교하지 않고 `collectsViaCoupangDirectship` 만 묻는다(KID-255).
 *
 * 채널 레지스트리(`@kiditem/shared/channel-registry`)는 이 채널을 우리 확장이 수집한다는
 * 것까지만 답한다(`collector: 'extension'`). 어느 owner 가 수집하는지는 레지스트리의 칸이
 * 아니므로 — 레지스트리에 칸을 늘리지 않고 — 그 owner 의 파일인 여기가 답한다.
 */
export const COUPANG_DIRECT_MALL_KEY = 'coupang-direct';

/** 이 몰의 주문을 쿠팡 직배송 owner 가 수집하는가. */
export function collectsViaCoupangDirectship(mallKey: string): boolean {
  return mallKey === COUPANG_DIRECT_MALL_KEY;
}

/** 로켓 계정을 고르기 전에는 수집할 범위 자체가 없다. */
const ROCKET_ACCOUNT_REQUIRED = '쿠팡 로켓 계정을 먼저 선택해 주세요.';

export type CoupangDirectshipHandoff = Readonly<{
  extensionId: string;
  attempt: CoupangDirectOwnerAttemptControl;
}>;

/**
 * 한 로켓 계정의 직배송 원천 상태 — 실행 reader(`orders.coupang_directship`)를 계정으로 나눠 공용 컨트롤이 읽던
 * 모양(진행 중·마지막 완료·마지막 실행)으로 옮긴다(KID-359).
 */
export async function readCoupangDirectshipSource(
  channelAccountId: string,
): Promise<OrderCollectionSourceStatus> {
  const accountId = channelAccountId.toLowerCase();
  const operations = (await readRecentCoupangDirectOperations())
    .filter((operation) => (operation.plan as { channelAccountId?: unknown } | null)?.channelAccountId === accountId)
    .map(directshipAttemptView);
  const running = operations.find((attempt) => attempt.state === 'RUNNING') ?? null;
  const complete = operations.find((attempt) => attempt.state === 'COMPLETE') ?? null;
  const last = operations[0] ?? null;
  return {
    mallKey: null,
    channelAccountId: accountId,
    running: running ? { attemptId: running.attemptId, collectionMode: 'browser', startedAt: running.startedAt, expiresAt: running.expiresAt } : null,
    lastComplete: complete ? { attemptId: complete.attemptId, completedAt: complete.endedAt, publicationSequence: null } : null,
    lastAttempt: last
      ? { attemptId: last.attemptId, state: last.state, errorCode: last.errorCode, errorMessage: last.errorMessage, endedAt: last.endedAt }
      : null,
  };
}

/** 운영자 중단: 서버 실행을 취소한다(토큰 없이, 어느 브라우저에서든 — KID-159). */
export function cancelCoupangDirectshipAttempt(attemptId: string) {
  return apiClient.post(`/api/operations/${encodeURIComponent(attemptId)}/cancel`);
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
 * 이 시작은 입력을 읽지 않는다. 몰 카드와 같은 시작 입력 타입을 들고 서서, 카드가
 * 실어 보내는 입력을 그대로 받아 흘린다(KID-214).
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
}>): OrderCollectionSourceAdapter<OrderCollectionSourceStatus> {
  return {
    sourceKey: `orders.coupang_directship:${channelAccountId ?? ''}`,
    label: '쿠팡 직배송 주문 수집',
    card: {
      // 카드를 누르면 입고예정일 달력이 먼저 열린다 — 어느 날짜의 발주를 수집할지 고른 뒤 시작한다.
      opensChooser: true,
      // 직배송은 로켓 계정 범위로 수집한다. 계정이 없으면 시작 자체가 없다.
      startBlockedReason: channelAccountId ? null : ROCKET_ACCOUNT_REQUIRED,
    },
    statusQuery: collectionSourceStatusQueryOptions<
      OrderCollectionSourceStatus,
      Error,
      OrderCollectionSourceStatus,
      QueryKey
    >({
      queryKey: queryKeys.orders.coupangDirectshipSource(channelAccountId ?? ''),
      queryFn: () => readCoupangDirectshipSource(channelAccountId ?? ''),
      enabled: Boolean(channelAccountId),
      // 도는 캡처가 있을 때만 자주 읽는다.
      refetchInterval: (query) => (query.state.data?.running ? COLLECTION_RUNNING_POLL_MS : COLLECTION_IDLE_POLL_MS),
      refetchIntervalInBackground: false,
      meta: { suppressGlobalErrorToast: true },
    }),
    readRunning: (status) =>
      status.running ? { attemptId: status.running.attemptId, scopeLabel: null } : null,
    // Without a chosen Rocket account there is nothing to collect for; the
    // control then shows only what the owner already has.
    ...(channelAccountId
      ? {
        start: (input) => {
          let opened: CoupangDirectOwnerAttemptControl | null = null;
          return startWebOpenedCollection({
            detectExtension: detectDirectshipExtension,
            begin: async (idempotencyKey) => {
              const started = await beginCoupangDirectAttempt(idempotencyKey, channelAccountId, {
                automatic: input?.selectionMode === 'automatic',
              });
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
      return requestOperationCancel(attemptId);
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
