'use client';

import {
  RocketPoSourceAttemptSchema,
  RocketPoSourceBeginSchema,
  RocketPoSourceSchema,
  type RocketPoSource,
} from '@kiditem/shared/rocket-purchase-preview';
import type { QueryKey } from '@tanstack/react-query';
import type {
  CollectionSourceAdapter,
  CollectionStartOutcome,
} from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { handOffToExtensionRun, startWebOpenedCollection } from '@/lib/collection-start';
import { detectOrderCollectionExtensionRuntime } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';

const BASE = '/api/channels/rocket-po';
const RUNNING_POLL_MS = 2_000;
const ROCKET_PO_CAPABILITY = 'coupangRocketPoSourceOwnerV1';

export type RocketPoCollectionRange = Readonly<{ from: string; to: string }>;

export function loadRocketPoSource(channelAccountId: string): Promise<RocketPoSource> {
  return apiClient.getParsed(
    `${BASE}/source?channelAccountId=${encodeURIComponent(channelAccountId)}`,
    RocketPoSourceSchema,
  );
}

/**
 * The account-scoped Channels source read every Rocket screen shares. Views
 * that read it without the collection control keep its own running poll.
 */
export function rocketPoSourceQueryOptions(channelAccountId: string) {
  return collectionSourceStatusQueryOptions<RocketPoSource, Error, RocketPoSource, QueryKey>({
    queryKey: queryKeys.orders.rocketPoSource(channelAccountId),
    queryFn: () => loadRocketPoSource(channelAccountId),
    enabled: Boolean(channelAccountId),
    refetchInterval: (query) =>
      query.state.data?.latestAttempt?.state === 'RUNNING' ? RUNNING_POLL_MS : false,
    meta: { suppressGlobalErrorToast: true },
  });
}

function cancelRocketPoAttempt(attemptId: string) {
  return apiClient.post(`${BASE}/attempts/${encodeURIComponent(attemptId)}/cancel`);
}

function startRocketPoCollection(
  channelAccountId: string,
  range: RocketPoCollectionRange,
): Promise<CollectionStartOutcome> {
  const request = RocketPoSourceBeginSchema.parse({
    channelAccountId,
    from: range.from,
    to: range.to,
    status: '',
    dateType: 'WAREHOUSING_PLAN_DATE',
    requireConfirmation: true,
  });
  return startWebOpenedCollection({
    detectExtension: async () => {
      const runtime = await detectOrderCollectionExtensionRuntime(1_200, [ROCKET_PO_CAPABILITY]);
      if (runtime.status === 'incompatible') {
        throw new Error('주문수집 확장프로그램이 이전 버전입니다. extensions/kiditem-os 를 새로고침한 뒤 다시 시도해주세요.');
      }
      if (runtime.status !== 'ready') {
        throw new Error('주문수집 확장프로그램을 찾지 못했습니다. extensions/kiditem-os 를 로드하고 supplier.coupang.com 로그인 후 다시 시도해주세요.');
      }
      return runtime.extensionId;
    },
    begin: async (idempotencyKey) => {
      const raw = await apiClient.post(`${BASE}/attempts`, request, {
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      // The begin reply may carry the write token; the page keeps only attempt metadata.
      const started = RocketPoSourceAttemptSchema.strip().parse(raw);
      if (started.channelAccountId !== channelAccountId) {
        throw new Error('로켓 계정 수집 식별자가 일치하지 않습니다.');
      }
      return { outcome: 'opened', attemptId: started.attemptId, running: started.state === 'RUNNING' };
    },
    handOff: ({ extensionId, attemptId }) =>
      handOffToExtensionRun(extensionId, attemptId, { action: 'collectRocketPoRows', attemptId }),
    cancel: ({ attemptId }) => cancelRocketPoAttempt(attemptId),
  });
}

/**
 * One Rocket account's PO collection for the shared control. The page opens
 * the Channels attempt and hands it to the extension, which uploads the
 * catalog to the owner; a COMPLETE publishes the saved collection every Rocket
 * screen reopens.
 */
export function rocketPoCollection(
  channelAccountId: string,
): CollectionSourceAdapter<RocketPoSource, RocketPoCollectionRange> {
  return {
    sourceKey: `orders.coupang_rocket_po:${channelAccountId}`,
    label: '쿠팡 로켓 PO 수집',
    statusQuery: rocketPoSourceQueryOptions(channelAccountId),
    readRunning: (status) => {
      const attempt = status.latestAttempt;
      return attempt?.state === 'RUNNING'
        ? { attemptId: attempt.attemptId, scopeLabel: `${attempt.plan.from} ~ ${attempt.plan.to}` }
        : null;
    },
    start: (range) => startRocketPoCollection(channelAccountId, range),
    cancelOnServer: cancelRocketPoAttempt,
    readCompleteId: (status) => status.latestComplete?.attemptId ?? null,
    onNewComplete: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.rocketSavedPoLists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
    },
  };
}
