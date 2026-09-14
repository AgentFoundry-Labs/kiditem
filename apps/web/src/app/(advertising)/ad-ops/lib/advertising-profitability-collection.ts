'use client';

import { z } from 'zod';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { startWindowCollection } from '@/lib/collection-start';
import { queryKeys } from '@/lib/query-keys';
import type { QueryKey } from '@tanstack/react-query';

const SOURCE_PATH = '/api/ads/profitability-imports';
const RUNNING_POLL_MS = 2_000;

const SourceAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
  startedAt: z.string(),
  capturedAt: z.string().nullable(),
  expiresAt: z.string(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
}).strict();

const SourceCompleteSchema = z.object({
  sourceImportRunId: z.string().uuid(),
  publicationSequence: z.string(),
  mappingGeneration: z.string(),
  coveredThrough: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  capturedAt: z.string(),
  qualitySummary: z.object({}).passthrough(),
}).strict();

const AdvertisingProfitabilitySourceViewSchema = z.object({
  latestAttempt: SourceAttemptSchema.nullable(),
  latestComplete: SourceCompleteSchema.nullable(),
  ready: z.boolean(),
}).strict();

export type AdvertisingProfitabilitySourceView = z.infer<
  typeof AdvertisingProfitabilitySourceViewSchema
>;

const readAdvertisingProfitabilitySource = (): Promise<AdvertisingProfitabilitySourceView> =>
  apiClient.getParsed(`${SOURCE_PATH}/current`, AdvertisingProfitabilitySourceViewSchema);

/**
 * The per-product ad spend import. The page starts the owner through the
 * extension's collection window; it never begins or fails the attempt itself
 * and never runs the ABC calculation.
 */
export const advertisingProfitabilityCollection: CollectionSourceAdapter<AdvertisingProfitabilitySourceView> = {
  sourceKey: 'advertising.profitability_import',
  label: '상품별 광고비 보고서',
  statusQuery: collectionSourceStatusQueryOptions<
    AdvertisingProfitabilitySourceView,
    Error,
    AdvertisingProfitabilitySourceView,
    QueryKey
  >({
    queryKey: queryKeys.ads.profitabilitySource(),
    queryFn: readAdvertisingProfitabilitySource,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.latestAttempt?.state === 'RUNNING' ? RUNNING_POLL_MS : false,
    meta: { suppressGlobalErrorToast: true },
  }),
  readRunning: (status) =>
    status.latestAttempt?.state === 'RUNNING'
      ? { attemptId: status.latestAttempt.attemptId, scopeLabel: null }
      : null,
  start: () => startWindowCollection('advertising.profitability_import', {}),
  cancelOnServer: (attemptId) =>
    apiClient.post(`${SOURCE_PATH}/${encodeURIComponent(attemptId)}/cancel`),
  readCompleteId: (status) => status.latestComplete?.sourceImportRunId ?? null,
  // A new publication changes the ad spend that ad and dashboard screens read.
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.ads.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  },
};
