'use client';

import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { queryKeys } from '@/lib/query-keys';
import {
  cancelWingTrackedProductAttempt,
  fetchWingTrackedProductSourceStatus,
  type WingTrackedProductSourceStatus,
} from './wing-tracking-api';
import type { QueryKey } from '@tanstack/react-query';

/**
 * The tracked Wing products collection's running state and operator stop for
 * the shared control. Product tracking starts it through 지표 새로고침, which
 * opens the owner attempt and hands it to the extension.
 */
export const wingTrackedProductsCollection: CollectionSourceAdapter<WingTrackedProductSourceStatus> = {
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
