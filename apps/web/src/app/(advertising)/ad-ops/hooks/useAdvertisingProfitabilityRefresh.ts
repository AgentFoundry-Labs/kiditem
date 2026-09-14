'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import {
  detectOrderCollectionExtensionRuntime,
  sendToExtension,
} from '@/lib/extension-bridge';
import { transferExtensionAuthTo } from '@/lib/extension-auth';
import { queryKeys } from '@/lib/query-keys';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';

const SOURCE_PATH = '/api/ads/profitability-imports/current';
const EXTENSION_ACTION = 'collectAdvertisingProfitability';
const EXTENSION_CAPABILITY = 'profitabilityAdvertisingSourceOwnerV1';

const SourceAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
  startedAt: z.string(),
  capturedAt: z.string().nullable(),
  expiresAt: z.string(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
}).strict();

const SourceCompleteSchema = z.object({
  sourceImportRunId: z.string().uuid(),
  publicationSequence: z.string(),
  mappingGeneration: z.string(),
  coveredThrough: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  capturedAt: z.string(),
  qualitySummary: z.object({}).passthrough(),
}).strict();

const AdvertisingProfitabilitySourceViewSchema = z.object({
  latestAttempt: SourceAttemptSchema.nullable(),
  latestComplete: SourceCompleteSchema.nullable(),
  ready: z.boolean(),
}).strict();

export type AdvertisingProfitabilitySourceView = z.infer<
  typeof AdvertisingProfitabilitySourceViewSchema
>;

const readSource = (): Promise<AdvertisingProfitabilitySourceView> =>
  apiClient.getParsed(SOURCE_PATH, AdvertisingProfitabilitySourceViewSchema);

function extensionError(status: 'incompatible' | 'not_found'): Error {
  return status === 'incompatible'
    ? new Error('상품별 광고비 수집을 지원하는 익스텐션으로 새로고침해 주세요.')
    : new Error('상품별 광고비 수집 익스텐션을 연결한 뒤 다시 시도해 주세요.');
}

/**
 * The page only starts the existing source owner. It never begins or fails a
 * server attempt itself, and it never invokes the ABC calculation.
 */
export function useAdvertisingProfitabilityRefresh() {
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const activeRequest = useRef<{
    previousAttemptId: string | null;
    idempotencyKey: string;
  } | null>(null);
  const lastObservedAttempt = useRef<{
    attemptId: string;
    state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  } | null>(null);
  const handledCompleteAttempt = useRef<string | null>(null);
  const source = useQuery(collectionSourceStatusQueryOptions({
    queryKey: queryKeys.ads.profitabilitySource(),
    queryFn: readSource,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      starting || query.state.data?.latestAttempt?.state === 'RUNNING' ? 2_000 : false,
    meta: { suppressGlobalErrorToast: true },
  }));

  const invalidateConsumers = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.ads.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  }, [queryClient]);

  const observeActiveTerminal = useCallback((attempt: AdvertisingProfitabilitySourceView['latestAttempt']) => {
    const request = activeRequest.current;
    if (!request || !attempt || attempt.attemptId === request.previousAttemptId) return;

    if (attempt.state === 'COMPLETE') {
      activeRequest.current = null;
      idempotencyKey.current = null;
      setStarting(false);
      setActionError(null);
      if (handledCompleteAttempt.current !== attempt.attemptId) {
        handledCompleteAttempt.current = attempt.attemptId;
        invalidateConsumers();
        toast.success('상품별 광고비 보고서 수집이 완료되었습니다.');
      }
      return;
    }
    if (attempt.state === 'FAILED') {
      activeRequest.current = null;
      idempotencyKey.current = null;
      setStarting(false);
      const message = attempt.errorMessage ?? '상품별 광고비 보고서 수집에 실패했습니다.';
      setActionError(message);
      toast.error(message);
    }
  }, [invalidateConsumers]);

  useEffect(() => {
    const attempt = source.data?.latestAttempt;
    if (!attempt) return;
    const previous = lastObservedAttempt.current;
    const activeBeforeObservation = activeRequest.current !== null;
    observeActiveTerminal(attempt);
    if (
      previous?.attemptId === attempt.attemptId
      && previous.state === 'RUNNING'
      && attempt.state === 'COMPLETE'
      && !activeBeforeObservation
      && handledCompleteAttempt.current !== attempt.attemptId
    ) {
      handledCompleteAttempt.current = attempt.attemptId;
      invalidateConsumers();
    }
    lastObservedAttempt.current = {
      attemptId: attempt.attemptId,
      state: attempt.state,
    };
  }, [invalidateConsumers, observeActiveTerminal, source.data?.latestAttempt]);

  const reconcile = async (requestKey: string, lostReply: boolean) => {
    try {
      const observed = await source.refetch();
      const attempt = observed.data?.latestAttempt;
      if (activeRequest.current?.idempotencyKey !== requestKey) return;
      observeActiveTerminal(attempt ?? null);
      if (!activeRequest.current) return;
      if (attempt?.state === 'RUNNING') {
        setActionError(
          lostReply
            ? '브라우저 응답을 확인하지 못했습니다. 서버 수집 상태를 확인하는 중입니다.'
            : '상품별 광고비 보고서 수집이 진행 중입니다.',
        );
        return;
      }
      if (lostReply) {
        setActionError('브라우저 응답을 확인하지 못했습니다. 잠시 후 수집 상태를 새로고침해 주세요.');
      }
    } catch {
      // A lost page read cannot turn a committed or running owner into FAILED.
      if (lostReply) {
        setActionError('브라우저 응답을 확인하지 못했습니다. 잠시 후 수집 상태를 새로고침해 주세요.');
      }
    }
  };

  const start = async () => {
    if (starting) return;
    if (source.data?.latestAttempt?.state === 'RUNNING') {
      setActionError('상품별 광고비 보고서 수집이 이미 진행 중입니다.');
      return;
    }

    setStarting(true);
    setActionError(null);
    const previousAttemptId = source.data?.latestAttempt?.attemptId ?? null;
    const key = idempotencyKey.current ?? createSecureRandomUuid();
    idempotencyKey.current = key;

    try {
      const runtime = await detectOrderCollectionExtensionRuntime(1_200, [
        EXTENSION_CAPABILITY,
      ]);
      if (runtime.status !== 'ready') throw extensionError(runtime.status);
      await transferExtensionAuthTo(runtime.extensionId);
      activeRequest.current = { previousAttemptId, idempotencyKey: key };

      let lostReply = false;
      try {
        await sendToExtension(
          runtime.extensionId,
          { action: EXTENSION_ACTION, idempotencyKey: key },
          35 * 60_000,
        );
      } catch {
        // The source owner owns terminal state. A lost browser reply is not a
        // permission to call the server fail endpoint from this page.
        lostReply = true;
      }
      await reconcile(key, lostReply);
    } catch (error) {
      if (activeRequest.current?.idempotencyKey !== key && idempotencyKey.current !== key) return;
      setActionError(error instanceof Error ? error.message : '상품별 광고비 보고서 수집 실패');
      toast.error(error instanceof Error ? error.message : '상품별 광고비 보고서 수집 실패');
    } finally {
      if (activeRequest.current?.idempotencyKey === key || idempotencyKey.current === key) {
        setStarting(false);
        void source.refetch();
      }
    }
  };

  return {
    source,
    starting,
    actionError,
    start,
  };
}
