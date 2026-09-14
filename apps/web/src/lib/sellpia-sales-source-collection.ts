'use client';

import { SellpiaSalesSourceStatusSchema } from '@kiditem/shared/dashboard';
import type {
  CollectionSourceAdapter,
  CollectionStartOutcome,
} from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { handOffToExtensionRun, startWebOpenedCollection } from '@/lib/collection-start';
import { detectOrderCollectionExtensionId } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { beginSellpiaSalesSourceAttempt } from '@/lib/sellpia-sales-api';
import type { z } from 'zod';
import type { QueryKey } from '@tanstack/react-query';

const SOURCE_PATH = '/api/sellpia-sales';
const REQUIRED_CAPABILITY = 'collectSellpiaSaleSummaryAuthoritativeV1';
const EXTENSION_ACTION = 'collectSellpiaSaleSummary';
const RUNNING_POLL_MS = 2_000;
const IDLE_POLL_MS = 60_000;

export type SellpiaSalesSourceStatus = z.infer<typeof SellpiaSalesSourceStatusSchema>;
export type SellpiaSalesCollectionRange = Readonly<{ from: string; to: string }>;

/** The dates a readiness check asks Sellpia sales to repair; none leaves the window to the owner. */
export function sellpiaSalesReadinessRange(check: Readonly<{
  referenceDate?: string | null;
  expectedDates?: readonly string[] | null;
  missingDates?: readonly string[] | null;
}>): SellpiaSalesCollectionRange | undefined {
  const targetDates = check.missingDates?.length
    ? [...check.missingDates]
    : check.expectedDates?.length
      ? [check.expectedDates[0]!]
      : check.referenceDate
        ? [check.referenceDate]
        : [];
  const sorted = [...targetDates].sort();
  if (sorted.length === 0) return undefined;
  const nextReferenceDate = check.referenceDate
    ? new Date(`${check.referenceDate}T00:00:00.000Z`)
    : null;
  if (nextReferenceDate && !Number.isNaN(nextReferenceDate.getTime())) {
    nextReferenceDate.setUTCDate(nextReferenceDate.getUTCDate() + 1);
  }
  return {
    from: sorted[0]!,
    // Readiness judges through yesterday; the home month total reads through today.
    to: nextReferenceDate && !Number.isNaN(nextReferenceDate.getTime())
      ? nextReferenceDate.toISOString().slice(0, 10)
      : sorted.at(-1)!,
  };
}

function cancelSellpiaSalesAttempt(attemptId: string) {
  return apiClient.post(`${SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}/cancel`);
}

function startSellpiaSalesCollection(
  range: SellpiaSalesCollectionRange | void,
): Promise<CollectionStartOutcome> {
  return startWebOpenedCollection({
    detectExtension: async () => {
      const extensionId = await detectOrderCollectionExtensionId(1_200, REQUIRED_CAPABILITY);
      if (!extensionId) {
        throw new Error(
          '안전한 판매현황 수집 기능이 필요합니다. extensions/kiditem-os를 Chrome에서 새로고침하고 kiditem.sellpia.com에 로그인한 뒤 다시 시도해주세요.',
        );
      }
      return extensionId;
    },
    begin: async (idempotencyKey) => {
      const started = await beginSellpiaSalesSourceAttempt({
        idempotencyKey,
        from: range ? range.from : undefined,
        to: range ? range.to : undefined,
      });
      return { outcome: 'opened', attemptId: started.attemptId, running: started.state === 'RUNNING' };
    },
    handOff: ({ extensionId, attemptId }) =>
      handOffToExtensionRun(extensionId, { action: EXTENSION_ACTION, attemptId }),
    cancel: ({ attemptId }) => cancelSellpiaSalesAttempt(attemptId),
  });
}

/**
 * Sellpia sales (몰별 일매출) collection for the shared control. The page
 * opens the owner attempt for a range, or the owner's default window, and
 * hands it to the extension, which uploads the sale summary to the owner.
 */
export const sellpiaSalesCollection: CollectionSourceAdapter<
  SellpiaSalesSourceStatus,
  SellpiaSalesCollectionRange | void
> = {
  sourceKey: 'analytics.sellpia_sales',
  label: '셀피아 판매현황 수집',
  statusQuery: collectionSourceStatusQueryOptions<
    SellpiaSalesSourceStatus,
    Error,
    SellpiaSalesSourceStatus,
    QueryKey
  >({
    queryKey: queryKeys.dashboard.sellpiaSalesSource(),
    queryFn: () => apiClient.getParsed(`${SOURCE_PATH}/source`, SellpiaSalesSourceStatusSchema),
    refetchInterval: (query) =>
      query.state.data?.latestAttempt?.state === 'RUNNING' ? RUNNING_POLL_MS : IDLE_POLL_MS,
    refetchIntervalInBackground: false,
    meta: { suppressGlobalErrorToast: true },
  }),
  readRunning: (status) => {
    const attempt = status.latestAttempt;
    if (attempt?.state !== 'RUNNING') return null;
    const { from, to } = attempt.plan.range;
    return { attemptId: attempt.attemptId, scopeLabel: from === to ? from : `${from} ~ ${to}` };
  },
  start: (range) => startSellpiaSalesCollection(range),
  cancelOnServer: cancelSellpiaSalesAttempt,
  readCompleteId: (status) => status.latestComplete?.attemptId ?? null,
  // A new COMPLETE republished the daily sales the sales screens, readiness and Wing daily sales read.
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.sellpiaSalesAll() });
    void queryClient.invalidateQueries({ queryKey: ['readiness'] });
    void queryClient.invalidateQueries({ queryKey: ['traffic'] });
  },
};
