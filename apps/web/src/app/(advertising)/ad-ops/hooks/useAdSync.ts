'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdCampaignSourceAttemptSchema,
  AdCampaignSourceStatusSchema,
} from '@kiditem/shared/advertising';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { transferExtensionAuthTo } from '@/lib/extension-auth';
import { queryKeys } from '@/lib/query-keys';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';

const SOURCE_PATH = '/api/ads/ad-campaigns';
const readSource = async () =>
  AdCampaignSourceStatusSchema.parse(await apiClient.get(SOURCE_PATH + '/source'));

export function adSyncSucceededNotice(progressLabel: string | null | undefined): {
  tone: 'success' | 'warning';
  message: string;
} {
  return progressLabel?.includes('원본만 보존')
    ? { tone: 'warning', message: progressLabel }
    : { tone: 'success', message: '광고 동기화가 완료되었습니다.' };
}

async function campaignExtension() {
  const extensionId = await detectExtensionId();
  if (!extensionId) throw new Error('브라우저 수집 익스텐션을 찾을 수 없습니다.');
  const ping = await sendToExtension<{
    success?: boolean;
    capabilities?: { advertisingCampaignSourceOwnerV1?: boolean };
  }>(extensionId, { action: 'ping' });
  if (!ping?.success || !ping.capabilities?.advertisingCampaignSourceOwnerV1)
    throw new Error('광고 동기화를 지원하는 익스텐션으로 새로고침해 주세요.');
  await transferExtensionAuthTo(extensionId);
  return extensionId;
}

/** Owner reads survive page reload; only the explicit action starts browser work. */
export function useAdSync({ onComplete }: { onComplete?: () => void } = {}) {
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const request = useRef<{ key: string; attemptId?: string } | null>(null);
  const client = useQueryClient();
  const source = useQuery(collectionSourceStatusQueryOptions({
    queryKey: queryKeys.ads.campaignSource(),
    queryFn: readSource,
    refetchInterval: (query) =>
      query.state.data?.latestAttempt?.state === 'RUNNING' ? 2_000 : false,
    meta: { suppressGlobalErrorToast: true },
  }));
  const sourceLoaded = source.data !== undefined;
  const completeId = source.data?.latestComplete?.attemptId ?? null;
  // The first owner read is the COMPLETE this mount already renders. Only a
  // COMPLETE observed after it (a sweep finished during this session)
  // refreshes the screens that read the campaign ledger.
  const baselineCompleteId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!sourceLoaded) return;
    const previous = baselineCompleteId.current;
    baselineCompleteId.current = completeId;
    if (previous === undefined || completeId === null || completeId === previous) return;
    void client.invalidateQueries({ queryKey: queryKeys.ads.all });
    void client.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    void client.invalidateQueries({ queryKey: ['readiness'] });
  }, [sourceLoaded, completeId, client]);

  const run = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const extensionId = await campaignExtension();
      let attempt = (await readSource()).latestAttempt;
      if (attempt?.state !== 'RUNNING') {
        if (attempt && request.current?.attemptId === attempt.attemptId) request.current = null;
        request.current ??= { key: createSecureRandomUuid() };
        attempt = AdCampaignSourceAttemptSchema.parse(
          await apiClient.post(
            SOURCE_PATH + '/attempts',
            {},
            { headers: { 'Idempotency-Key': request.current.key } },
          ),
        );
      }
      if (request.current) request.current.attemptId = attempt.attemptId;
      try {
        await sendToExtension(
          extensionId,
          { action: 'collectAdvertisingCampaigns', attemptId: attempt.attemptId },
          35 * 60_000,
        );
      } catch {
        /* A lost browser ACK is not an owner failure. */
      }
      const observed = AdCampaignSourceAttemptSchema.parse(
        await apiClient.get(SOURCE_PATH + '/attempts/' + attempt.attemptId),
      );
      if (observed.state !== 'RUNNING' && request.current?.attemptId === observed.attemptId)
        request.current = null;
      if (observed.state === 'COMPLETE') {
        const notice = adSyncSucceededNotice(
          observed.rawOnlyCampaignCount
            ? '광고 동기화 완료 · ' + observed.rawOnlyCampaignCount + '개는 식별자 없어 원본만 보존'
            : null,
        );
        toast[notice.tone](notice.message);
        onComplete?.();
      } else if (observed.state === 'FAILED') {
        if (observed.errorCode === 'USER_CANCELLED') toast.info('광고 동기화가 중단되었습니다.');
        else toast.error(observed.errorMessage ?? '광고 동기화에 실패했습니다.');
      } else toast.info('광고 동기화가 아직 진행 중입니다. 서버 완료 상태를 확인해 주세요.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '광고 동기화 실패');
    } finally {
      await source.refetch();
      setLoading(false);
    }
  };

  const cancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      const current = (await readSource()).latestAttempt;
      if (current?.state !== 'RUNNING') return;
      const extensionId = await campaignExtension();
      try {
        await sendToExtension(extensionId, {
          action: 'cancelAdvertisingCampaigns',
          attemptId: current.attemptId,
        });
      } catch {
        /* Only the owner read confirms cancellation. */
      }
      if ((await source.refetch()).data?.latestAttempt?.state === 'RUNNING')
        toast.warning('중단 결과를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '광고 동기화 중단 실패');
    } finally {
      setCancelling(false);
    }
  };
  return { loading, cancelling, run, cancel, source, status: source.data?.latestAttempt ?? null };
}
