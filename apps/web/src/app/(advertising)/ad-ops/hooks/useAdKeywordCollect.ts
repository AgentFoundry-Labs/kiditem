'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdKeywordSourceAttemptSchema,
  AdKeywordSourceStatusSchema,
} from '@kiditem/shared/advertising';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { transferExtensionAuthTo } from '@/lib/extension-auth';
import { queryKeys } from '@/lib/query-keys';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';

const SOURCE_PATH = '/api/ads/ad-keywords';
const readSource = async () =>
  AdKeywordSourceStatusSchema.parse(await apiClient.get(`${SOURCE_PATH}/source`));

async function keywordExtension() {
  const extensionId = await detectExtensionId();
  if (!extensionId) throw new Error('브라우저 수집 익스텐션을 찾을 수 없습니다.');
  const ping = await sendToExtension<{
    success?: boolean;
    capabilities?: { advertisingKeywordSourceOwnerV1?: boolean };
  }>(extensionId, { action: 'ping' });
  if (!ping?.success || !ping.capabilities?.advertisingKeywordSourceOwnerV1) {
    throw new Error('광고 키워드 수집을 지원하는 익스텐션으로 새로고침해 주세요.');
  }
  await transferExtensionAuthTo(extensionId);
  return extensionId;
}

/** Explicit collection only. Owner polling never starts or resumes provider IO. */
export function useAdKeywordCollect({ onComplete }: { onComplete?: () => void } = {}) {
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const request = useRef<{ key: string; attemptId?: string } | null>(null);
  const client = useQueryClient();
  const source = useQuery({
    queryKey: queryKeys.ads.keywordSource(),
    queryFn: readSource,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.latestAttempt?.state === 'RUNNING' ? 2_000 : false,
    meta: { suppressGlobalErrorToast: true },
  });
  const completeId = source.data?.latestComplete?.attemptId;
  useEffect(() => {
    if (!completeId) return;
    void client.invalidateQueries({ queryKey: queryKeys.ads.all });
    void client.invalidateQueries({ queryKey: ['readiness'] });
  }, [completeId, client]);

  const run = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const extensionId = await keywordExtension();
      const current = await readSource();
      let attempt = current.latestAttempt;
      if (attempt?.state !== 'RUNNING') {
        if (attempt && request.current?.attemptId === attempt.attemptId) request.current = null;
        request.current ??= { key: createSecureRandomUuid() };
        attempt = AdKeywordSourceAttemptSchema.parse(
          await apiClient.post(
            `${SOURCE_PATH}/attempts`,
            {},
            { headers: { 'Idempotency-Key': request.current.key } },
          ),
        );
      }
      if (request.current) request.current.attemptId = attempt.attemptId;

      try {
        await sendToExtension(
          extensionId,
          {
            action: 'collectAdvertisingKeywords',
            attemptId: attempt.attemptId,
          },
          35 * 60_000,
        );
      } catch {
        // A lost browser reply cannot undo a committed source. Read its owner.
      }
      const observed = AdKeywordSourceAttemptSchema.parse(
        await apiClient.get(`${SOURCE_PATH}/attempts/${attempt.attemptId}`),
      );
      if (observed.state !== 'RUNNING' && request.current?.attemptId === observed.attemptId)
        request.current = null;
      if (observed.state === 'COMPLETE') {
        toast.success('광고 키워드 수집이 완료되었습니다.');
        onComplete?.();
      } else if (observed.state === 'FAILED') {
        toast.error(observed.errorMessage ?? '광고 키워드 수집에 실패했습니다.');
      } else {
        toast.info('아직 전체 수집이 끝나지 않았습니다. 같은 수집을 이어서 실행할 수 있습니다.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '광고 키워드 수집 실패');
    } finally {
      await source.refetch();
      setLoading(false);
    }
  };

  const cancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      const current = await readSource();
      if (current.latestAttempt?.state !== 'RUNNING') return;
      const extensionId = await keywordExtension();
      try {
        await sendToExtension(extensionId, {
          action: 'cancelAdvertisingKeywords',
          attemptId: current.latestAttempt.attemptId,
        });
      } catch {
        // Cancellation is confirmed by the owner read, not the browser reply.
      }
      const observed = await source.refetch();
      if (observed.data?.latestAttempt?.state === 'RUNNING') {
        toast.warning('중단 결과를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '광고 키워드 수집 중단 실패');
    } finally {
      setCancelling(false);
    }
  };

  return {
    loading,
    cancelling,
    run,
    cancel,
    source,
    status: source.data?.latestAttempt ?? null,
  };
}
