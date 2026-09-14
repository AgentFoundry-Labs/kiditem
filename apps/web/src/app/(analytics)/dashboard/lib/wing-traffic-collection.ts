'use client';

import {
  AdTrafficSourceStatusSchema,
  type AdTrafficSourceStatus,
} from '@kiditem/shared/advertising';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { requestCollectionStart } from '@/lib/collection-start';
import { queryKeys } from '@/lib/query-keys';
import type { QueryKey } from '@tanstack/react-query';

const SOURCE_PATH = '/api/ads/traffic';
const RUNNING_POLL_MS = 2_000;

export type WingTrafficRange = Readonly<{ startDate: string; endDate: string }>;

export const wingTrafficSourceQueryKey = [
  ...queryKeys.dashboard.all,
  'wing-traffic-source',
] as const;

export function formatWingTrafficRange(range: WingTrafficRange): string {
  return `${range.startDate} ~ ${range.endDate}`;
}

async function readWingTrafficSource(): Promise<AdTrafficSourceStatus> {
  return AdTrafficSourceStatusSchema.parse(await apiClient.get(`${SOURCE_PATH}/source`));
}

/**
 * Wing daily traffic for one closed KST range, started through the
 * extension's collection window. The owner freezes the range it admits; a
 * running attempt reports its own range.
 */
export const wingTrafficCollection: CollectionSourceAdapter<AdTrafficSourceStatus, WingTrafficRange> = {
  sourceKey: 'dashboard.wing_sales',
  label: 'Wing 일별 트래픽',
  statusQuery: collectionSourceStatusQueryOptions<
    AdTrafficSourceStatus,
    Error,
    AdTrafficSourceStatus,
    QueryKey
  >({
    queryKey: [...wingTrafficSourceQueryKey, 'primary'],
    queryFn: readWingTrafficSource,
    refetchInterval: (query) =>
      query.state.data?.latestAttempt?.state === 'RUNNING' ? RUNNING_POLL_MS : false,
    refetchIntervalInBackground: false,
    meta: { suppressGlobalErrorToast: true },
  }),
  readRunning: (status) => {
    const attempt = status.latestAttempt;
    return attempt?.state === 'RUNNING'
      ? { attemptId: attempt.attemptId, scopeLabel: formatWingTrafficRange(attempt.plan) }
      : null;
  },
  start: (range) =>
    requestCollectionStart('dashboard.wing_sales', {
      startDate: range.startDate,
      endDate: range.endDate,
    }),
  cancelOnServer: (attemptId) =>
    apiClient.post(`${SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}/cancel`),
  readCompleteId: (status) => status.latestComplete?.attemptId ?? null,
  // A completed range republishes the traffic the dashboard read models aggregate.
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  },
};
