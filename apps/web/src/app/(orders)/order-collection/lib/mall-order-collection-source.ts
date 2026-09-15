'use client';

import {
  OrderCollectionSourceStatusSchema,
  type OrderCollectionSourceStatus,
} from '@kiditem/shared/order-collection-source';
import type { QueryKey } from '@tanstack/react-query';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { sendBrowserCollectionControl } from '@/lib/browser-collection-session';
import { startWebOpenedCollection } from '@/lib/collection-start';
import { queryKeys } from '@/lib/query-keys';
import {
  detectOrderCollectionSessionExtensionStatus,
  orderCollectionExtensionUnavailableMessage,
} from './order-collection-extension';
import { todayYmd } from './order-collection-page-model';
import {
  beginOrderCollectionSourceAttempt,
  ORDER_COLLECTION_SOURCE_PATH,
  rememberActiveOrderCollectionAttempt,
  type OrderCollectionSourceAttemptControl,
} from './order-collection-source-owner';
import type { OrderCollectionMallAccount } from './order-mall-account-api';

/** Every mounted mall card re-reads its owner this often while nothing runs. */
const SOURCE_IDLE_POLL_MS = 60_000;

export type OrderCollectionMode = 'browser' | 'manual-upload';

/** What one start collects; the owner keeps it on the attempt's plan. */
export type MallOrderCollectionStartInput = Readonly<{
  collectionDate?: string;
  selectionMode?: 'manual' | 'automatic';
  seenRowKeys?: readonly string[];
}>;

/**
 * The opened attempt as the mall's extension procedure receives it: the fence
 * token the conversion endpoints carry travels with it, and never through the
 * source status read.
 */
export type MallOrderCollectionHandoff = Readonly<{
  extensionId: string;
  attempt: OrderCollectionSourceAttemptControl;
  input: MallOrderCollectionStartInput;
}>;

export function readMallOrderCollectionSource(
  mallKey: string,
): Promise<OrderCollectionSourceStatus> {
  return apiClient.getParsed(
    `${ORDER_COLLECTION_SOURCE_PATH}/source?mallKey=${encodeURIComponent(mallKey)}`,
    OrderCollectionSourceStatusSchema,
  );
}

/** The owner's operator stop. Organization-scoped, so any tab can end the attempt. */
export function cancelMallOrderCollectionAttempt(attemptId: string) {
  return apiClient.post(
    `${ORDER_COLLECTION_SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}/cancel`,
  );
}

async function detectMallCollectionExtension(): Promise<string> {
  const status = await detectOrderCollectionSessionExtensionStatus();
  if (status.status !== 'ready') {
    throw new Error(orderCollectionExtensionUnavailableMessage(status));
  }
  return status.extensionId;
}

/**
 * One mall's order collection for the shared control. The page opens the owner
 * attempt and hands it to the extension procedure this mall needs; the owner's
 * organization-scoped status read is what every browser sees as running, so a
 * second tab shows and stops the same collection.
 *
 * The browser-local attempt memory stays a resume hint for the reloaded screen
 * only. It is written after the owner admits the attempt and is never read to
 * decide whether the mall is collecting.
 */
export function mallOrderCollectionSource({
  organizationId,
  account,
  collectionMode = 'browser',
  handOff,
  abortLocalRun,
}: Readonly<{
  organizationId: string | null;
  account: OrderCollectionMallAccount;
  collectionMode?: OrderCollectionMode;
  /** The mall's own extension hand-off, which runs its collection to the end. */
  handOff: (handoff: MallOrderCollectionHandoff) => Promise<void>;
  /** Ends this browser's procedure for the attempt the operator is stopping. */
  abortLocalRun?: (attemptId: string) => void;
}>): CollectionSourceAdapter<OrderCollectionSourceStatus, MallOrderCollectionStartInput> {
  return {
    sourceKey: `orders.mall:${account.key}`,
    label: `${account.name} 주문 수집`,
    statusQuery: collectionSourceStatusQueryOptions<
      OrderCollectionSourceStatus,
      Error,
      OrderCollectionSourceStatus,
      QueryKey
    >({
      queryKey: queryKeys.orders.collectionSource(organizationId ?? '', account.key),
      queryFn: () => readMallOrderCollectionSource(account.key),
      enabled: Boolean(organizationId),
      refetchInterval: SOURCE_IDLE_POLL_MS,
      refetchIntervalInBackground: false,
      meta: { suppressGlobalErrorToast: true },
    }),
    readRunning: (status) =>
      status.running ? { attemptId: status.running.attemptId, scopeLabel: account.name } : null,
    start: (input) => {
      let opened: OrderCollectionSourceAttemptControl | null = null;
      return startWebOpenedCollection({
        detectExtension: detectMallCollectionExtension,
        begin: async (idempotencyKey) => {
          const started = await beginOrderCollectionSourceAttempt(idempotencyKey, {
            mallKey: account.key,
            collectionDate: collectionMode === 'browser'
              ? input.collectionDate ?? todayYmd()
              : null,
            collectionMode,
            ...(collectionMode === 'browser'
              ? { selectionMode: input.selectionMode ?? 'manual' }
              : {}),
            ...(input.seenRowKeys ? { seenRowKeys: [...input.seenRowKeys] } : {}),
          });
          opened = started;
          if (organizationId) {
            const hint = {
              attemptId: started.attemptId,
              idempotencyKey,
              mallKey: account.key,
            };
            rememberActiveOrderCollectionAttempt(organizationId, hint);
            rememberActiveOrderCollectionAttempt(organizationId, hint, undefined, account.key);
          }
          return {
            outcome: 'opened',
            attemptId: started.attemptId,
            running: started.state === 'RUNNING',
          };
        },
        handOff: ({ extensionId }) => {
          if (!opened) throw new Error(`${account.name} 주문 수집 시도를 찾지 못했습니다.`);
          return handOff({ extensionId, attempt: opened, input });
        },
        cancel: ({ attemptId }) => cancelMallOrderCollectionAttempt(attemptId),
      });
    },
    cancelInExtension: (attemptId) => {
      // 이 브라우저가 돌리던 절차부터 끊는다. 서버 취소만으로는 페이지 루프가 계속 돈다.
      abortLocalRun?.(attemptId);
      return sendBrowserCollectionControl(attemptId, 'cancelCollectionSession');
    },
    cancelOnServer: cancelMallOrderCollectionAttempt,
    // Order owners assign no publication number, so the completed attempt is
    // the latest collection's identity (KID-189 2c-1).
    readCompleteId: (status) => status.lastComplete?.attemptId ?? null,
    onNewComplete: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.stats() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.pipelines() });
      // 대시보드의 "몰 주문수집" 칸이 들고 있는 마지막 수집 시각(KID-185).
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.collections() });
    },
  };
}
