'use client';

import { useState } from 'react';
import type { ReadinessCheck } from '@kiditem/shared/readiness';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { runReadinessExtensionCollection } from '@/components/readiness/readiness-extension-collection';
import { useBrowserCollectionSession } from '@/hooks/useBrowserCollectionSession';
import { recordMissingBrowserCollection } from '@/lib/browser-collection-session';
import { detectExtensionId } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';

const AD_SYNC_CHECK: ReadinessCheck = {
  key: 'ad_sync',
  label: '광고 동기화 (캠페인별 상품)',
  status: 'missing',
  detail: '운영중 캠페인 자동 순회',
  lastSyncedAt: null,
  count: null,
  collector: 'extension',
  collectEndpoint: null,
  scrapeUrls: [
    'https://advertising.coupang.com/marketing/dashboard/sales#kiditemAdSync=1',
  ],
  referenceDate: null,
  expectedDates: null,
  missingDates: null,
};

interface UseAdSyncOptions {
  onComplete?: () => void;
}

export function useAdSync({ onComplete }: UseAdSyncOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const collectionSession = useBrowserCollectionSession(runId);

  const run = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const extensionId = await detectExtensionId();
      if (!extensionId) {
        const missing = await recordMissingBrowserCollection(
          'advertising.ad_sync',
          { trigger: 'ad_sync' },
        );
        setRunId(missing.runId);
        toast.warning('브라우저 수집 익스텐션을 찾을 수 없습니다.');
        return;
      }

      const nextRunId = crypto.randomUUID();
      setRunId(nextRunId);
      toast.info('광고 동기화를 백그라운드에서 시작합니다.');
      const session = await runReadinessExtensionCollection({
        check: AD_SYNC_CHECK,
        producer: 'advertising.ad_sync',
        extensionId,
        runId: nextRunId,
      });

      if (session.status === 'succeeded') {
        toast.success('광고 동기화가 완료되었습니다.');
      } else if (session.status === 'attention_required') {
        toast.warning(session.attention?.message ?? '광고센터 확인이 필요합니다.');
      } else if (session.status === 'cancelled') {
        toast.info('광고 동기화가 중단되었습니다.');
      } else if (session.status === 'failed') {
        toast.error(session.progress.label ?? '광고 동기화에 실패했습니다.');
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.ads.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
        queryClient.invalidateQueries({ queryKey: ['traffic'] }),
        queryClient.invalidateQueries({ queryKey: ['readiness'] }),
      ]);
      onComplete?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '광고 동기화 실패');
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
