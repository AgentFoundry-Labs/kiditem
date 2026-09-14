'use client';

import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { queryKeys } from '@/lib/query-keys';
import {
  cancelSourcing1688TrendAttempt,
  fetchSourcing1688TrendSourceStatus,
  type Sourcing1688TrendSourceStatus,
} from './sourcing-1688-source-owner';
import type { QueryKey } from '@tanstack/react-query';

/**
 * The 1688 hot-product collection's running state and operator stop for the
 * shared control. The decision center starts it through its own supply CTA,
 * and the extension opens and runs the attempt.
 */
export const sourcing1688TrendCollection: CollectionSourceAdapter<Sourcing1688TrendSourceStatus> = {
  sourceKey: 'sourcing.1688_trend',
  label: '1688 공급 후보 수집',
  statusQuery: collectionSourceStatusQueryOptions<
    Sourcing1688TrendSourceStatus,
    Error,
    Sourcing1688TrendSourceStatus,
    QueryKey
  >({
    queryKey: queryKeys.sourcing.trend1688SourceStatus(),
    queryFn: fetchSourcing1688TrendSourceStatus,
  }),
  readRunning: (status) =>
    status.latestAttempt?.state === 'RUNNING'
      ? { attemptId: status.latestAttempt.attemptId, scopeLabel: null }
      : null,
  cancelOnServer: (attemptId) => cancelSourcing1688TrendAttempt(attemptId),
  readCompleteId: (status) => status.latestComplete?.attemptId ?? null,
  // A new COMPLETE republished the supply candidates the sourcing screens read.
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.sourcing.all,
      predicate: (query) => !query.queryKey.includes('source-status'),
    });
  },
};
