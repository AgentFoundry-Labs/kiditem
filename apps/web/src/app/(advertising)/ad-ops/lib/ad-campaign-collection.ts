'use client';

import type { QueryKey } from '@tanstack/react-query';
import {
  AdCampaignSourceStatusSchema,
  type AdCampaignSourceAttempt,
  type AdCampaignSourceStatus,
} from '@kiditem/shared/advertising';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { startWindowCollection } from '@/lib/collection-start';
import { queryKeys } from '@/lib/query-keys';

const SOURCE_PATH = '/api/ads/ad-campaigns';
const RUNNING_POLL_MS = 2_000;

async function readAdCampaignSource(): Promise<AdCampaignSourceStatus> {
  return AdCampaignSourceStatusSchema.parse(await apiClient.get(`${SOURCE_PATH}/source`));
}

/** The campaign sweep and a manual report share one live attempt per account; its plan names which runs. */
export function adCampaignAttemptScopeLabel(attempt: AdCampaignSourceAttempt): string {
  const range = `${attempt.plan.startDate} ~ ${attempt.plan.endDate}`;
  return attempt.plan.captureMode === 'manual_report'
    ? `원본 보고서 ${attempt.plan.period === '7d' ? '7일' : '1일'} · ${range}`
    : `캠페인 순회 · ${range}`;
}

/** The 31-day campaign sweep, started through the extension's collection window. */
export const adCampaignSweepCollection: CollectionSourceAdapter<AdCampaignSourceStatus> = {
  sourceKey: 'advertising.ad_sync',
  label: '광고 동기화',
  statusQuery: collectionSourceStatusQueryOptions<
    AdCampaignSourceStatus,
    Error,
    AdCampaignSourceStatus,
    QueryKey
  >({
    queryKey: queryKeys.ads.campaignSource(),
    queryFn: readAdCampaignSource,
    refetchInterval: (query) =>
      query.state.data?.latestAttempt?.state === 'RUNNING' ? RUNNING_POLL_MS : false,
    meta: { suppressGlobalErrorToast: true },
  }),
  readRunning: (status) => {
    const attempt = status.latestAttempt;
    return attempt?.state === 'RUNNING'
      ? { attemptId: attempt.attemptId, scopeLabel: adCampaignAttemptScopeLabel(attempt) }
      : null;
  },
  start: () => startWindowCollection('advertising.ad_sync', {}),
  cancelOnServer: (attemptId) =>
    apiClient.post(`${SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}/cancel`),
  readCompleteId: (status) => status.latestComplete?.attemptId ?? null,
  // A sweep that finished while the page was open republished the campaign
  // ledger that ad, dashboard and readiness screens read.
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.ads.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    void queryClient.invalidateQueries({ queryKey: ['readiness'] });
  },
};
