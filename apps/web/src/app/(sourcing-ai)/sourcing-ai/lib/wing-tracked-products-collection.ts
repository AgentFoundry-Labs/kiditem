'use client';

import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { handOffToExtensionRun, startWebOpenedCollection } from '@/lib/collection-start';
import { queryKeys } from '@/lib/query-keys';
import {
  beginWingTrackedProductAttempt,
  cancelWingTrackedProductAttempt,
  fetchWingTrackedProductSourceStatus,
  requireWingTrackedProductExtension,
  type WingTrackedProductSourceStatus,
} from './wing-tracking-api';
import type { QueryKey } from '@tanstack/react-query';

const TRACKED_WING_ACTION = 'collectAdvertisingTrackedWingProducts';

/**
 * The tracked Wing products collection for the shared control. 지표 새로고침
 * finds the extension, opens the owner attempt for the tracked keywords and
 * hands it to the extension run; an attempt the run does not take is stopped
 * through the owner.
 */
export const wingTrackedProductsCollection: CollectionSourceAdapter<
  WingTrackedProductSourceStatus,
  readonly string[]
> = {
  sourceKey: 'advertising.wing_tracked_products',
  label: '추적 상품 지표 수집',
  statusQuery: collectionSourceStatusQueryOptions<
    WingTrackedProductSourceStatus,
    Error,
    WingTrackedProductSourceStatus,
    QueryKey
  >({
    queryKey: queryKeys.sourcing.wingTrackedSourceStatus(),
    queryFn: fetchWingTrackedProductSourceStatus,
  }),
  readRunning: (status) =>
    status.latestAttempt?.state === 'RUNNING'
      ? { attemptId: status.latestAttempt.attemptId, scopeLabel: null }
      : null,
  start: (keywords) =>
    startWebOpenedCollection({
      detectExtension: requireWingTrackedProductExtension,
      begin: async (idempotencyKey) => {
        const plan = await beginWingTrackedProductAttempt({ idempotencyKey, keywords: [...keywords] });
        return { outcome: 'opened', attemptId: plan.attemptId, running: plan.state === 'RUNNING' };
      },
      // The run begins again under the same key, which returns this attempt.
      handOff: ({ extensionId, attemptId, idempotencyKey }) =>
        handOffToExtensionRun(extensionId, attemptId, {
          action: TRACKED_WING_ACTION,
          idempotencyKey,
          keywords: [...keywords],
        }),
      cancel: ({ attemptId }) => cancelWingTrackedProductAttempt(attemptId),
    }),
  cancelOnServer: (attemptId) => cancelWingTrackedProductAttempt(attemptId),
  readCompleteId: (status) => status.latestComplete?.sourceImportRunId ?? null,
  // A new COMPLETE republished the tracked products and their histories.
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.sourcing.wingTrackedProducts(),
      predicate: (query) => !query.queryKey.includes('source-status'),
    });
  },
};
