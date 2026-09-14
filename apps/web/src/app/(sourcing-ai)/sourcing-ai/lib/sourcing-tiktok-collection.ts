'use client';

import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { queryKeys } from '@/lib/query-keys';
import {
  cancelSourcingTiktokCcAttempt,
  fetchSourcingTiktokCcSourceStatus,
  type SourcingTiktokCcSourceStatus,
} from './sourcing-tiktok-source-owner';
import type { QueryKey } from '@tanstack/react-query';

/**
 * The TikTok Creative Center collection's running state and operator stop for
 * the shared control, read beside the trend snapshot of the given window. The
 * market view starts it through its own CTA, and the extension opens and runs
 * the attempt.
 */
export function sourcingTiktokCcCollection(days: number): CollectionSourceAdapter<SourcingTiktokCcSourceStatus> {
  const snapshotQueryKey = queryKeys.sourcing.trendTiktokCc(days);
  return {
    sourceKey: 'sourcing.tiktok_cc_trend',
    label: '틱톡 트렌드 수집',
    statusQuery: collectionSourceStatusQueryOptions<
      SourcingTiktokCcSourceStatus,
      Error,
      SourcingTiktokCcSourceStatus,
      QueryKey
    >({
      queryKey: [...snapshotQueryKey, 'source-status'],
      queryFn: fetchSourcingTiktokCcSourceStatus,
    }),
    readRunning: (status) =>
      status.latestAttempt?.state === 'RUNNING'
        ? { attemptId: status.latestAttempt.attemptId, scopeLabel: null }
        : null,
    cancelOnServer: (attemptId) => cancelSourcingTiktokCcAttempt(attemptId),
    readCompleteId: (status) => status.latestComplete?.attemptId ?? null,
    // A new COMPLETE republished the TikTok trend snapshot this view reads.
    onNewComplete: (queryClient) => {
      void queryClient.invalidateQueries({
        queryKey: snapshotQueryKey,
        predicate: (query) => !query.queryKey.includes('source-status'),
      });
    },
  };
}
