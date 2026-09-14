'use client';

import {
  AdCampaignSourceStatusSchema,
  type AdCampaignSourceAttempt,
  type AdCampaignSourceStatus,
} from '@kiditem/shared/advertising';
import {
  MANUAL_CAMPAIGN_REPORT_DAYS,
  type ManualCampaignReportPeriod,
} from '@kiditem/shared/collection-start';
import { shiftBusinessDateKey } from '@kiditem/shared/common';
import type {
  CollectionRunning,
  CollectionSourceAdapter,
} from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { requestCollectionStart } from '@/lib/collection-start';
import { queryKeys } from '@/lib/query-keys';
import type { QueryKey } from '@tanstack/react-query';

const SOURCE_PATH = '/api/ads/ad-campaigns';

/** The exact range a manual campaign report captures. */
export type ManualCampaignReportRange = Readonly<{
  period: ManualCampaignReportPeriod;
  startDate: string;
  endDate: string;
}>;

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

// Both campaign controls read one status; the account's live attempt runs either capture mode.
const adCampaignSourceStatusQuery = collectionSourceStatusQueryOptions<
  AdCampaignSourceStatus,
  Error,
  AdCampaignSourceStatus,
  QueryKey
>({
  queryKey: queryKeys.ads.campaignSource(),
  queryFn: readAdCampaignSource,
  meta: { suppressGlobalErrorToast: true },
});

function liveCampaignAttempt(status: AdCampaignSourceStatus): CollectionRunning | null {
  const attempt = status.activeAttempt;
  return attempt?.state === 'RUNNING'
    ? { attemptId: attempt.attemptId, scopeLabel: adCampaignAttemptScopeLabel(attempt) }
    : null;
}

function cancelCampaignAttempt(attemptId: string) {
  return apiClient.post(`${SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}/cancel`);
}

/** The 31-day campaign sweep, started through the extension's collection window. */
export const adCampaignSweepCollection: CollectionSourceAdapter<AdCampaignSourceStatus> = {
  sourceKey: 'advertising.ad_sync',
  label: '광고 동기화',
  statusQuery: adCampaignSourceStatusQuery,
  readRunning: liveCampaignAttempt,
  start: () => requestCollectionStart('advertising.ad_sync', {}),
  cancelOnServer: cancelCampaignAttempt,
  readCompleteId: (status) => status.latestComplete?.attemptId ?? null,
  // A sweep that finished while the page was open republished the campaign
  // ledger that ad, dashboard and readiness screens read.
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.ads.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    void queryClient.invalidateQueries({ queryKey: ['readiness'] });
  },
};

/**
 * The manual report range for a report period ending at the ad data cutoff,
 * or null until the cutoff is known. The report period is the control's own
 * choice, independent of the page period.
 */
export function exactManualReportRange(
  period: ManualCampaignReportPeriod,
  knownThrough: string | null | undefined,
): ManualCampaignReportRange | null {
  if (!knownThrough) return null;
  return {
    period,
    startDate: shiftBusinessDateKey(knownThrough, 1 - MANUAL_CAMPAIGN_REPORT_DAYS[period]),
    endDate: knownThrough,
  };
}

/**
 * The ad center's own campaign report for one exact 1-day or 7-day range,
 * started through the extension's collection window. A new complete report
 * republishes the manual reports the campaign tab reads.
 */
export const adCampaignManualReportCollection: CollectionSourceAdapter<
  AdCampaignSourceStatus,
  ManualCampaignReportRange
> = {
  sourceKey: 'advertising.ad_sync:manual_report',
  label: '원본 보고서',
  statusQuery: adCampaignSourceStatusQuery,
  readRunning: liveCampaignAttempt,
  start: (range) =>
    requestCollectionStart('advertising.ad_sync', {
      captureMode: 'manual_report',
      period: range.period,
      startDate: range.startDate,
      endDate: range.endDate,
    }),
  cancelOnServer: cancelCampaignAttempt,
  readCompleteId: (status) =>
    status.latestManualReport?.state === 'COMPLETE' ? status.latestManualReport.attemptId : null,
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.ads.manualReportsAll() });
  },
};
