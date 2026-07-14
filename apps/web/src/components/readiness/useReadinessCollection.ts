import { useState } from 'react';
import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';
import type { ReadinessCheck } from '@kiditem/shared/readiness';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { recordMissingBrowserCollection } from '@/lib/browser-collection-session';
import { detectExtensionId } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import {
  readinessCollectionProducer,
  runReadinessExtensionCollection,
} from './readiness-extension-collection';

interface UseReadinessCollectionOptions {
  refetchReadiness: () => Promise<unknown>;
}

const AD_SYNC_CHECK: ReadinessCheck = {
  key: 'ad_sync',
  label: '광고 동기화 (캠페인별 상품)',
  status: 'missing',
  detail: '운영중 캠페인별 상품 수집',
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

function collectHref(check: ReadinessCheck): string {
  if (check.key === 'wing_sales') return '/sales-analysis?tab=wing-daily';
  if (check.key === 'rocket_sales') return '/sales-analysis?tab=rocket-daily';
  if (check.key === 'coupang_ads') return '/ad-ops';
  return '/dashboard';
}

function makeRunId(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('이 브라우저는 안전한 수집 실행 ID 생성을 지원하지 않습니다.');
  }
  return crypto.randomUUID();
}

export function useReadinessCollection({
  refetchReadiness,
}: UseReadinessCollectionOptions) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const invalidateCollectedData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
      queryClient.invalidateQueries({ queryKey: ['traffic'] }),
      queryClient.invalidateQueries({ queryKey: ['readiness'] }),
    ]);
  };

  const handleServerCollect = async (check: ReadinessCheck) => {
    if (!check.collectEndpoint) return;
    setPendingKey(check.key);
    try {
      await apiClient.post(check.collectEndpoint, {});
      toast.success('수집 완료');
      await invalidateCollectedData();
      await refetchReadiness();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '수집 실패');
    } finally {
      setPendingKey(null);
    }
  };

  const announceSession = (session: BrowserCollectionSessionView) => {
    if (session.status === 'succeeded') {
      toast.success(`${session.progress.completed}/${session.progress.total}개 수집 완료`);
    } else if (session.status === 'attention_required') {
      toast.warning(session.attention?.message ?? '브라우저 확인이 필요합니다.');
    } else if (session.status === 'cancelled') {
      toast.info('브라우저 수집이 중단되었습니다.');
    } else if (session.status === 'failed') {
      toast.error(session.progress.label ?? '브라우저 수집에 실패했습니다.');
    }
  };

  const runExtensionCollection = async (
    check: ReadinessCheck,
    producer: NonNullable<ReturnType<typeof readinessCollectionProducer>>,
    extensionId: string,
    requestedRunId?: string,
  ) => {
    const session = await runReadinessExtensionCollection({
      check,
      producer,
      extensionId,
      runId: requestedRunId ?? makeRunId(),
    });
    announceSession(session);
    return session;
  };

  const handleCollect = async (
    check: ReadinessCheck,
    requestedRunId?: string,
  ) => {
    if (check.collector === 'server') {
      await handleServerCollect(check);
      return;
    }

    const producer = readinessCollectionProducer(check.key);
    if (!producer) {
      toast.error('지원하지 않는 브라우저 수집 항목입니다.');
      return;
    }
    if (!check.scrapeUrls?.length) {
      toast.error('수집 URL 없음');
      return;
    }

    setPendingKey(check.key);
    try {
      const extensionId = await detectExtensionId();
      if (!extensionId) {
        await recordMissingBrowserCollection(producer, {
          checkKey: check.key,
          trigger: 'readiness',
        }, requestedRunId);
        toast.warning('브라우저 수집 익스텐션을 찾을 수 없습니다.');
        return;
      }

      const session = await runExtensionCollection(
        check,
        producer,
        extensionId,
        requestedRunId,
      );
      if (check.key === 'coupang_ads' && session.status === 'succeeded') {
        await runReadinessExtensionCollection({
          check: AD_SYNC_CHECK,
          producer: 'advertising.ad_sync',
          extensionId,
          runId: makeRunId(),
        });
      }

      await invalidateCollectedData();
      await refetchReadiness();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '브라우저 수집 실패');
    } finally {
      setPendingKey(null);
    }
  };

  return { pendingKey, handleCollect };
}
