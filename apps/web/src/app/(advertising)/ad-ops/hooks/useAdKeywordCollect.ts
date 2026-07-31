'use client';

import { useState } from 'react';
import type { ReadinessCheck } from '@kiditem/shared/readiness';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthSession } from '@/components/providers/AuthProvider';
import { runReadinessExtensionCollection } from '@/components/readiness/readiness-extension-collection';
import { useBrowserCollectionSession } from '@/hooks/useBrowserCollectionSession';
import { recordMissingBrowserCollection } from '@/lib/browser-collection-session';
import { detectExtensionId } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';

/**
 * Standalone keyword collection over every advertised product.
 *
 * Separate from `useAdSync` on purpose: the campaign sweep walks 31 days of
 * daily facts per campaign, while this reads the ad-centre roster once and
 * pulls each ad's keyword table. It never navigates, so it can run on its own
 * without the daily sweep completing first.
 */
const AD_KEYWORD_CHECK: ReadinessCheck = {
  key: 'ad_keyword',
  label: '광고 키워드 (상품별)',
  status: 'missing',
  detail: '전체 캠페인 광고상품 키워드',
  lastSyncedAt: null,
  count: null,
  collector: 'extension',
  collectEndpoint: null,
  scrapeUrls: [
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdKeyword=1',
  ],
  referenceDate: null,
  expectedDates: null,
  missingDates: null,
};

interface UseAdKeywordCollectOptions {
  onComplete?: () => void;
}

export function useAdKeywordCollect({
  onComplete,
}: UseAdKeywordCollectOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { session: authSession } = useAuthSession();
  const collectionSession = useBrowserCollectionSession(runId);

  const run = async (requestedRunId?: string) => {
    if (loading) return;
    setLoading(true);
    try {
      const extensionId = await detectExtensionId();
      if (!extensionId) {
        const missing = await recordMissingBrowserCollection(
          'advertising.ad_keyword',
          { trigger: 'ad_keyword' },
          requestedRunId,
        );
        setRunId(missing.runId);
        toast.warning('브라우저 수집 익스텐션을 찾을 수 없습니다.');
        return;
      }

      const nextRunId = requestedRunId ?? createSecureRandomUuid();
      setRunId(nextRunId);
      const session = await runReadinessExtensionCollection({
        check: AD_KEYWORD_CHECK,
        producer: 'advertising.ad_keyword',
        extensionId,
        runId: nextRunId,
        accessToken: authSession?.token,
        onStarted: () => {
          toast.info('상품별 광고 키워드 수집을 백그라운드에서 시작합니다.');
        },
      });

      if (session.status === 'succeeded') {
        // The sweep is budgeted per run: a large account finishes across
        // several runs and reports what is still pending in its label.
        toast.success(session.progress.label ?? '광고 키워드 수집이 완료되었습니다.');
      } else if (session.status === 'attention_required') {
        toast.warning(session.attention?.message ?? '광고센터 확인이 필요합니다.');
      } else if (session.status === 'cancelled') {
        toast.info('광고 키워드 수집이 중단되었습니다.');
      } else if (session.status === 'failed') {
        toast.error(session.progress.label ?? '광고 키워드 수집에 실패했습니다.');
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.ads.all }),
        queryClient.invalidateQueries({ queryKey: ['readiness'] }),
      ]);
      onComplete?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : '광고 키워드 수집 실패',
      );
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    run,
    runId,
    status: collectionSession.data ?? null,
    collectionSession,
  };
}
