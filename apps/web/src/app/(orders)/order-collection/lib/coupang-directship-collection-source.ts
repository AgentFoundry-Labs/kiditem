'use client';

import {
  OrderCollectionSourceStatusSchema,
  type OrderCollectionSourceStatus,
} from '@kiditem/shared/order-collection-source';
import type { QueryKey } from '@tanstack/react-query';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { startWebOpenedCollection } from '@/lib/collection-start';
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
 */
export function coupangDirectshipCollectionSource({
  channelAccountId,
  handOff,
}: Readonly<{
  channelAccountId: string | null;
  /** The directship extension procedure, which runs the capture to the end. */
  handOff: (handoff: CoupangDirectshipHandoff) => Promise<void>;
}>): CollectionSourceAdapter<OrderCollectionSourceStatus> {
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
    cancelOnServer: cancelCoupangDirectshipAttempt,
    readCompleteId: (status) => status.lastComplete?.attemptId ?? null,
    onNewComplete: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.stats() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.pipelines() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.collections() });
    },
  };
}
