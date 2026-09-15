'use client';

import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { queryKeys } from '@/lib/query-keys';
import {
  cancelCompetitorCatalogAttempt,
  fetchCompetitorCatalogSourceStatus,
  type CompetitorCatalogSourceStatus,
} from './competitor-tracking-api';
import type { QueryKey } from '@tanstack/react-query';

/**
 * The competitor catalog collection's running state and operator stop for the
 * shared control. Competitor tracking starts it through its own collection
 * CTAs, and the extension opens and runs the attempt.
 */
export const competitorCatalogCollection: CollectionSourceAdapter<CompetitorCatalogSourceStatus> = {
  sourceKey: 'advertising.competitor_catalog',
  label: '경쟁 판매자 수집',
  statusQuery: collectionSourceStatusQueryOptions<
    CompetitorCatalogSourceStatus,
    Error,
    CompetitorCatalogSourceStatus,
    QueryKey
  >({
    queryKey: queryKeys.sourcing.competitorCatalogSourceStatus(),
    queryFn: fetchCompetitorCatalogSourceStatus,
  }),
  readRunning: (status) =>
    status.latestAttempt?.state === 'RUNNING'
      ? { attemptId: status.latestAttempt.attemptId, scopeLabel: null }
      : null,
  cancelOnServer: (attemptId) => cancelCompetitorCatalogAttempt(attemptId),
  readCompleteId: (status) => status.latestComplete?.sourceImportRunId ?? null,
  // A new COMPLETE republished the competitor sellers and catalogs the screen reads.
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({
      queryKey: [...queryKeys.sourcing.all, 'competitors'],
      predicate: (query) => !query.queryKey.includes('source-status'),
    });
  },
};
