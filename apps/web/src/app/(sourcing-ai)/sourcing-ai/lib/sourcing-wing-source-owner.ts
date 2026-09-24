'use client';

import { z } from 'zod';
import type {
  CollectionSourceAdapter,
  CollectionStartOutcome,
} from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import type { QueryKey } from '@tanstack/react-query';
import type { SourcingWingCatalogBatchInput } from '@kiditem/shared/sourcing';
import { operatorReason } from '@/lib/operator-error';

const SOURCE_PATH = '/api/sourcing/workspace/wing-catalog';
const START_CONFIRM_POLL_MS = 1_000;
const START_CONFIRM_READS = 15;
const EXTENSION_MISSING = 'KidItem OS 익스텐션을 연결한 뒤 다시 시도해주세요.';
const START_FAILED = 'Wing 카탈로그 수집을 시작하지 못했습니다.';

const PURPOSE_LABELS: Readonly<Record<string, string>> = {
  catalog_search: '카탈로그 검색',
  tracked_metrics: '추적 지표',
  market_analysis: '시장분석',
  recommendation_validation: '추천 검증',
};

// The sourcing owner publishes no shared Wing attempt schema; parse the fields the control reads.
const WingCatalogAttemptSchema = z
  .object({
    attemptId: z.string().uuid(),
    state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
    plan: z
      .object({
        keywords: z.array(z.string()),
        maxPages: z.number(),
        purpose: z.string(),
      })
      .passthrough(),
    errorCode: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
  })
  .passthrough();

export type WingCatalogAttempt = z.infer<typeof WingCatalogAttemptSchema>;

const ExtensionReplySchema = z
  .object({
    attemptId: z.string().uuid().optional(),
    error: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
  })
  .passthrough();

/** The organization's latest Wing catalog attempt; an empty body means none yet. */
async function readCurrentWingCatalogAttempt(): Promise<WingCatalogAttempt | null> {
  const current = await apiClient.getNullable<unknown>(`${SOURCE_PATH}/current`);
  return current === null ? null : WingCatalogAttemptSchema.parse(current);
}

function outcomeFromReply(value: unknown): CollectionStartOutcome {
  const reply = ExtensionReplySchema.safeParse(value);
  if (reply.success && reply.data.attemptId) {
    return { outcome: 'started', attemptId: reply.data.attemptId };
  }
  const reason = reply.success ? reply.data.error ?? reply.data.errorMessage ?? '' : '';
  if (/ALREADY_RUNNING|ATTEMPT_IN_PROGRESS/.test(reason)) return { outcome: 'running', attemptId: null };
  throw new Error(operatorReason(reason, START_FAILED));
}

const wait = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms);
});

/**
 * The extension opens the Wing catalog attempt and answers only when the
 * collection ends. The start resolves once the owner reports the attempt
 * running, or when the extension answers first.
 */
async function startWingCatalogCollection(
  input: SourcingWingCatalogBatchInput,
): Promise<CollectionStartOutcome> {
  const extensionId = await detectExtensionId();
  if (!extensionId) throw new Error(EXTENSION_MISSING);
  let settled = false;
  const reply = sendToExtension<unknown>(
    extensionId,
    { action: 'collectSourcingWingCatalog', ...input, idempotencyKey: createSecureRandomUuid() },
    null,
  ).then(
    (value) => {
      settled = true;
      return outcomeFromReply(value);
    },
    (error: unknown) => {
      settled = true;
      throw error;
    },
  );
  const confirmRunning = async (): Promise<CollectionStartOutcome> => {
    for (let read = 0; read < START_CONFIRM_READS && !settled; read += 1) {
      const current = await readCurrentWingCatalogAttempt().catch(() => null);
      if (current?.state === 'RUNNING') return { outcome: 'started', attemptId: current.attemptId };
      await wait(START_CONFIRM_POLL_MS);
    }
    return reply;
  };
  return Promise.race([reply, confirmRunning()]);
}

export function wingCatalogScopeLabel(attempt: WingCatalogAttempt): string {
  const [first, ...rest] = attempt.plan.keywords;
  const keywords = first ? (rest.length > 0 ? `${first} 외 ${rest.length}개` : first) : '';
  return [PURPOSE_LABELS[attempt.plan.purpose] ?? attempt.plan.purpose, keywords]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The sourcing Wing catalog collection for the shared control. Its completion
 * refreshes the sourcing reads only; recommendations and validation are
 * recalculated by their own explicit controls.
 */
export const sourcingWingCatalogCollection: CollectionSourceAdapter<
  WingCatalogAttempt | null,
  SourcingWingCatalogBatchInput
> = {
  sourceKey: 'sourcing.wing_catalog',
  label: 'Wing 카탈로그 수집',
  statusQuery: collectionSourceStatusQueryOptions<
    WingCatalogAttempt | null,
    Error,
    WingCatalogAttempt | null,
    QueryKey
  >({
    queryKey: [...queryKeys.sourcing.all, 'wing-source-attempt', 'current'],
    queryFn: readCurrentWingCatalogAttempt,
    meta: { suppressGlobalErrorToast: true },
  }),
  readRunning: (attempt) =>
    attempt?.state === 'RUNNING'
      ? { attemptId: attempt.attemptId, scopeLabel: wingCatalogScopeLabel(attempt) }
      : null,
  start: (input) => startWingCatalogCollection(input),
  cancelOnServer: (attemptId) =>
    apiClient.post(`${SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}/cancel`),
  readCompleteId: (attempt) => (attempt?.state === 'COMPLETE' ? attempt.attemptId : null),
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.sourcing.all,
      // Source status reads poll on their own; refresh the sourcing data reads.
      predicate: (query) =>
        !query.queryKey.includes('wing-source-attempt') && !query.queryKey.includes('source-status'),
    });
  },
};
