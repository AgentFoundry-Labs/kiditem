'use client';

import type { QueryKey } from '@tanstack/react-query';
import { z } from 'zod';
import type {
  CollectionSourceAdapter,
  CollectionStartOutcome,
} from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { queryKeys } from '@/lib/query-keys';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import { collectTrendSources, type TrendSourceCollectionResult } from '@/lib/source-trend-api';

const STATUS_PATH = '/api/sourcing/trend/status';
const START_CONFIRM_POLL_MS = 1_000;
const START_CONFIRM_READS = 10;

export const DEFAULT_TREND_SOURCES = ['naver', 'shorts'] as const;

const TREND_SOURCE_LABELS: Readonly<Record<string, string>> = {
  naver: '네이버',
  shorts: '쇼츠',
};

// The sourcing owner publishes no shared trend status schema; parse the fields the control reads.
const TrendSourceStatusSchema = z
  .object({
    latestAttempt: z
      .object({
        attemptId: z.string(),
        state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
        errorMessage: z.string().nullable().optional(),
      })
      .passthrough()
      .nullable(),
    // The newest collection this source completed; null until one has. A count
    // read from a source that never completed is unknown, not 0.
    latestComplete: z.object({ attemptId: z.string() }).passthrough().nullable().optional(),
    actualCutoffAt: z.string().nullable().optional(),
  })
  .passthrough();
const TrendStatusSchema = z.record(z.string(), TrendSourceStatusSchema);

export type TrendStatus = z.infer<typeof TrendStatusSchema>;

export type TrendCollectionInput = Readonly<{
  sources: readonly string[];
  /** Receives the collection result when the server-run request settles. */
  onSettled?: (result: TrendSourceCollectionResult) => void;
}>;

const readTrendStatus = () => apiClient.getParsed(STATUS_PATH, TrendStatusSchema);

const wait = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms);
});

function settledOutcome(result: TrendSourceCollectionResult): CollectionStartOutcome {
  const attempt = result.results.find((row) => row.attemptId);
  if (attempt?.attemptId) return { outcome: 'started', attemptId: attempt.attemptId };
  // A source whose plan is already running begins no attempt of its own.
  if (result.results.some((row) => /ATTEMPT_IN_PROGRESS/.test(row.error ?? ''))) {
    return { outcome: 'running', attemptId: null };
  }
  return { outcome: 'started', attemptId: null };
}

/**
 * The server runs a trend collection inside its request. The start resolves
 * once the status read shows a selected source running, or when the request
 * settles first; the request keeps running after the start resolves.
 */
async function startTrendCollection({
  sources,
  onSettled,
}: TrendCollectionInput): Promise<CollectionStartOutcome> {
  let settled = false;
  const request = collectTrendSources(sources, createSecureRandomUuid()).then(
    (result) => {
      settled = true;
      onSettled?.(result);
      return settledOutcome(result);
    },
    (error: unknown) => {
      settled = true;
      throw error;
    },
  );
  const confirmRunning = async (): Promise<CollectionStartOutcome> => {
    for (let read = 0; read < START_CONFIRM_READS && !settled; read += 1) {
      const status = await readTrendStatus().catch(() => null);
      const attempt = sources
        .map((source) => status?.[source]?.latestAttempt)
        .find((candidate) => candidate?.state === 'RUNNING');
      if (attempt) return { outcome: 'started', attemptId: attempt.attemptId };
      await wait(START_CONFIRM_POLL_MS);
    }
    return request;
  };
  return Promise.race([request, confirmRunning()]);
}

/**
 * Naver and Shorts trend collection for the shared control. The server runs
 * it, so it has no operator stop; every screen reads the same status.
 */
export const trendSourceCollection: CollectionSourceAdapter<TrendStatus, TrendCollectionInput> = {
  sourceKey: 'sourcing.trend',
  label: '트렌드 수집',
  statusQuery: collectionSourceStatusQueryOptions<TrendStatus, Error, TrendStatus, QueryKey>({
    queryKey: [...queryKeys.sourcing.trend(), 'source-status'],
    queryFn: readTrendStatus,
    meta: { suppressGlobalErrorToast: true },
  }),
  readRunning: (status) => {
    const running = Object.entries(status).filter(
      ([, row]) => row.latestAttempt?.state === 'RUNNING',
    );
    const first = running[0]?.[1].latestAttempt;
    return first
      ? {
        attemptId: first.attemptId,
        scopeLabel: running.map(([source]) => TREND_SOURCE_LABELS[source] ?? source).join('·'),
      }
      : null;
  },
  start: startTrendCollection,
  readCompleteId: (status) => {
    const ids = Object.values(status).flatMap((row) =>
      row.latestAttempt?.state === 'COMPLETE' ? [row.latestAttempt.attemptId] : []);
    return ids.length > 0 ? ids.sort().join(',') : null;
  },
  // A completed source republishes the trend snapshots and the recommendations built on them.
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.sourcing.all,
      predicate: (query) => !query.queryKey.includes('source-status'),
    });
  },
};
