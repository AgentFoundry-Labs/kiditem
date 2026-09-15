'use client';

import {
  AdKeywordSourceStatusSchema,
  type AdKeywordSourceStatus,
} from '@kiditem/shared/advertising';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { requestCollectionStart } from '@/lib/collection-start';
import { queryKeys } from '@/lib/query-keys';
import type { QueryKey } from '@tanstack/react-query';

const SOURCE_PATH = '/api/ads/ad-keywords';

async function readAdKeywordSource(): Promise<AdKeywordSourceStatus> {
  return AdKeywordSourceStatusSchema.parse(await apiClient.get(`${SOURCE_PATH}/source`));
}

/** The advertised-product keyword collection, started through the extension's collection window. */
export const adKeywordCollection: CollectionSourceAdapter<AdKeywordSourceStatus> = {
  sourceKey: 'advertising.ad_keyword',
  label: '광고 키워드 수집',
  statusQuery: collectionSourceStatusQueryOptions<
    AdKeywordSourceStatus,
    Error,
    AdKeywordSourceStatus,
    QueryKey
  >({
    queryKey: queryKeys.ads.keywordSource(),
    queryFn: readAdKeywordSource,
    meta: { suppressGlobalErrorToast: true },
  }),
  readRunning: (status) => {
    const attempt = status.latestAttempt;
    return attempt?.state === 'RUNNING'
      ? {
          attemptId: attempt.attemptId,
          scopeLabel: `${attempt.plan.startDate} ~ ${attempt.plan.endDate}`,
        }
      : null;
  },
  start: () => requestCollectionStart('advertising.ad_keyword', {}),
  cancelOnServer: (attemptId) =>
    apiClient.post(`${SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}/cancel`),
  readCompleteId: (status) => status.latestComplete?.attemptId ?? null,
  // Keyword facts feed the ad screens and the readiness check, not dashboard totals.
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.ads.all });
    void queryClient.invalidateQueries({ queryKey: ['readiness'] });
  },
};
