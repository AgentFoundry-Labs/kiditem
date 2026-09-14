'use client';

import { z } from 'zod';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { startWindowCollection } from '@/lib/collection-start';
import { queryKeys } from '@/lib/query-keys';
import type { QueryKey } from '@tanstack/react-query';

const SOURCE_PATH = '/api/ads/wing-itemwinner';
const RUNNING_POLL_MS = 2_000;

// The itemwinner owner publishes no shared status schema; parse the fields
// this control reads.
const WingItemwinnerAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
  plan: z.object({ businessDate: z.string().date() }),
  expiresAt: z.string(),
  observedAt: z.string().nullable(),
  itemCount: z.number().int().nonnegative(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

const WingItemwinnerSourceStatusSchema = z.object({
  channelAccountId: z.string().uuid().nullable(),
  ready: z.boolean(),
  latestAttempt: WingItemwinnerAttemptSchema.nullable(),
  latestComplete: WingItemwinnerAttemptSchema.nullable(),
  actualCutoffAt: z.string().nullable(),
});

export type WingItemwinnerSourceStatus = z.infer<typeof WingItemwinnerSourceStatusSchema>;

async function readWingItemwinnerSource(): Promise<WingItemwinnerSourceStatus> {
  return WingItemwinnerSourceStatusSchema.parse(await apiClient.get(`${SOURCE_PATH}/source`));
}

/** The Wing itemwinner page capture, started through the extension's collection window. */
export const wingItemwinnerCollection: CollectionSourceAdapter<WingItemwinnerSourceStatus> = {
  sourceKey: 'dashboard.wing_kpi',
  label: 'Wing 아이템위너',
  statusQuery: collectionSourceStatusQueryOptions<
    WingItemwinnerSourceStatus,
    Error,
    WingItemwinnerSourceStatus,
    QueryKey
  >({
    queryKey: queryKeys.ads.itemwinnerSource(),
    queryFn: readWingItemwinnerSource,
    refetchInterval: (query) =>
      query.state.data?.latestAttempt?.state === 'RUNNING' ? RUNNING_POLL_MS : false,
    meta: { suppressGlobalErrorToast: true },
  }),
  readRunning: (status) => {
    const attempt = status.latestAttempt;
    return attempt?.state === 'RUNNING'
      ? { attemptId: attempt.attemptId, scopeLabel: `${attempt.plan.businessDate} 기준` }
      : null;
  },
  start: () => startWindowCollection('dashboard.wing_kpi', {}),
  cancelOnServer: (attemptId) =>
    apiClient.post(`${SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}/cancel`),
  readCompleteId: (status) => status.latestComplete?.attemptId ?? null,
  // The status tab's itemwinner KPIs come from the ad extension status read.
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.ads.all });
  },
};
