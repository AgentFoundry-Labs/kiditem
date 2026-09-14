'use client';

import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { queryKeys } from '@/lib/query-keys';
import {
  cancelSourcingLiveCommerceAttempt,
  fetchSourcingLiveCommerceSourceStatus,
  type SourcingLiveCommerceSourceStatus,
} from './sourcing-live-commerce-source-owner';
import type { QueryKey } from '@tanstack/react-query';

/**
 * One live room's browser collection: its running state and operator stop for
 * the shared control. The owner reads a room only by its URL, so nothing is
 * read until the operator names one; the live commerce section starts the
 * collection through its own CTA, and the extension opens and runs the attempt.
 */
export function sourcingLiveCommerceBrowserCollection(
  url: string | null,
): CollectionSourceAdapter<SourcingLiveCommerceSourceStatus> {
  return {
    sourceKey: `sourcing.live_commerce:${url ?? ''}`,
    label: '라이브 방송 수집',
    statusQuery: collectionSourceStatusQueryOptions<
      SourcingLiveCommerceSourceStatus,
      Error,
      SourcingLiveCommerceSourceStatus,
      QueryKey
    >({
      queryKey: [...queryKeys.sourcing.liveCommerceExtensionStatus(), url],
      queryFn: () => fetchSourcingLiveCommerceSourceStatus(url ?? ''),
      enabled: url !== null,
    }),
    readRunning: (status) =>
      status.latestAttempt?.state === 'RUNNING'
        ? { attemptId: status.latestAttempt.attemptId, scopeLabel: null }
        : null,
    cancelOnServer: (attemptId) => cancelSourcingLiveCommerceAttempt(attemptId),
    readCompleteId: (status) => status.latestComplete?.attemptId ?? null,
    // A new COMPLETE republished the live broadcasts, products and keywords the section reads.
    onNewComplete: (queryClient) => {
      for (const queryKey of [
        [...queryKeys.sourcing.all, 'live-commerce', 'snapshots'],
        [...queryKeys.sourcing.all, 'live-commerce', 'keywords'],
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  };
}
