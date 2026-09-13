import { z } from 'zod';
import {
  SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY,
  SourcingKeywordSuggestionInputSchema,
  SourcingWingCatalogKeywordSchema,
  sourcingWingCatalogKeywordIdentity,
} from '@kiditem/shared/sourcing';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '@/lib/browser-storage';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { normalizeCoupangKeyword } from './coupang-keyword-snapshot-api';

export const COUPANG_KEYWORD_SUGGESTION_MAX_RESULTS = 30;
export const COUPANG_KEYWORD_SUGGESTION_SOURCE_PATH =
  '/api/sourcing/workspace/keyword-suggestions';
export const COUPANG_KEYWORD_SUGGESTION_EXTENSION_ACTION =
  'collectSourcingKeywordSuggestions';
export const COUPANG_KEYWORD_SUGGESTION_ATTEMPT_STORAGE_PREFIX =
  'kiditem:sourcing:coupang-keyword-suggestion-attempt';

const SourceAttemptStateSchema = z.enum(['RUNNING', 'COMPLETE', 'FAILED']);
const KeywordSuggestionPlanSchema = SourcingKeywordSuggestionInputSchema.extend({
  source: z.literal(SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY),
});

export const CoupangKeywordSuggestionSourceAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  sourceKey: z.literal(SOURCING_KEYWORD_SUGGESTION_SOURCE_KEY),
  scopeKey: z.literal('default'),
  targetKey: z.string().min(1),
  generation: z.number().int().positive(),
  state: SourceAttemptStateSchema,
  plan: KeywordSuggestionPlanSchema,
  planChecksum: z.string().min(1),
  contentChecksum: z.string().nullable(),
  acceptedCount: z.number().int().nonnegative(),
  warnings: z.array(z.string()).optional(),
  expiresAt: z.string().datetime({ offset: true }),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  completedAt: z.string().datetime({ offset: true }).nullable(),
}).passthrough();

export type CoupangKeywordSuggestionSourceAttempt = z.infer<
  typeof CoupangKeywordSuggestionSourceAttemptSchema
>;

export const CoupangKeywordSuggestionSourceStatusSchema = z.object({
  ready: z.boolean(),
  latestAttempt: CoupangKeywordSuggestionSourceAttemptSchema.nullable(),
  latestComplete: CoupangKeywordSuggestionSourceAttemptSchema.nullable(),
  actualCutoffAt: z.string().datetime({ offset: true }).nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
}).passthrough();

export type CoupangKeywordSuggestionSourceStatus = z.infer<
  typeof CoupangKeywordSuggestionSourceStatusSchema
>;

const ExtensionReplySchema = z.object({
  success: z.boolean(),
  attemptId: z.string().uuid(),
  state: SourceAttemptStateSchema,
  errorCode: z.string().nullable().optional(),
  warnings: z.array(z.string()).optional(),
}).passthrough();

export type CoupangKeywordSuggestionExtensionReply = z.infer<
  typeof ExtensionReplySchema
>;

export type ActiveCoupangKeywordSuggestionAttempt = {
  attemptId: string | null;
  idempotencyKey: string;
  keyword: string;
  maxResults: number;
};

const ActiveAttemptSchema = z.object({
  attemptId: z.string().uuid().nullable(),
  idempotencyKey: z.string().uuid(),
  keyword: SourcingWingCatalogKeywordSchema,
  maxResults: z.number().int().min(1).max(COUPANG_KEYWORD_SUGGESTION_MAX_RESULTS),
}).strict();

export function getCoupangKeywordSuggestionEnvironmentKey(): string {
  if (typeof window === 'undefined') return 'server';
  const origin = window.location.origin;
  return origin && origin !== 'null'
    ? origin
    : `${window.location.protocol}//${window.location.host}`;
}

export function coupangKeywordSuggestionAttemptStorageKey(
  organizationId: string,
  keyword: string,
  environmentKey = getCoupangKeywordSuggestionEnvironmentKey(),
): string {
  const normalizedKeyword = normalizeCoupangKeyword(keyword);
  return [
    COUPANG_KEYWORD_SUGGESTION_ATTEMPT_STORAGE_PREFIX,
    encodeURIComponent(organizationId),
    encodeURIComponent(environmentKey),
    encodeURIComponent(sourcingWingCatalogKeywordIdentity(normalizedKeyword)),
  ].join(':');
}

export function readActiveCoupangKeywordSuggestionAttempt(
  organizationId: string,
  keyword: string,
  environmentKey = getCoupangKeywordSuggestionEnvironmentKey(),
): ActiveCoupangKeywordSuggestionAttempt | null {
  if (!organizationId) return null;
  let raw: string | null;
  try {
    raw = safeStorageGet(
      'local',
      coupangKeywordSuggestionAttemptStorageKey(organizationId, keyword, environmentKey),
    );
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = ActiveAttemptSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function rememberActiveCoupangKeywordSuggestionAttempt(
  organizationId: string,
  attempt: ActiveCoupangKeywordSuggestionAttempt,
  environmentKey = getCoupangKeywordSuggestionEnvironmentKey(),
): void {
  if (!organizationId) return;
  safeStorageSet(
    'local',
    coupangKeywordSuggestionAttemptStorageKey(organizationId, attempt.keyword, environmentKey),
    JSON.stringify(attempt),
  );
}

export function clearActiveCoupangKeywordSuggestionAttempt(
  organizationId: string,
  keyword: string,
  environmentKey = getCoupangKeywordSuggestionEnvironmentKey(),
): void {
  if (!organizationId) return;
  try {
    safeStorageRemove(
      'local',
      coupangKeywordSuggestionAttemptStorageKey(organizationId, keyword, environmentKey),
    );
  } catch {
    // Invalid input is already rejected by the explicit source command.
  }
}

export function readCoupangKeywordSuggestionSourceAttempt(
  attemptId: string,
): Promise<CoupangKeywordSuggestionSourceAttempt> {
  return apiClient
    .getParsed(
      `${COUPANG_KEYWORD_SUGGESTION_SOURCE_PATH}/attempts/${encodeURIComponent(attemptId)}`,
      CoupangKeywordSuggestionSourceAttemptSchema,
    )
    .then((attempt) => {
      if (attempt.attemptId !== attemptId) {
        throw new Error('쿠팡 키워드 수집 시도 응답이 일치하지 않습니다.');
      }
      return attempt;
    });
}

export function fetchCoupangKeywordSuggestionSourceStatus(
  keyword: string,
): Promise<CoupangKeywordSuggestionSourceStatus> {
  const normalizedKeyword = normalizeCoupangKeyword(keyword);
  return apiClient.getParsed(
    `${COUPANG_KEYWORD_SUGGESTION_SOURCE_PATH}/current?keyword=${encodeURIComponent(normalizedKeyword)}`,
    CoupangKeywordSuggestionSourceStatusSchema,
  );
}

export async function collectSourcingKeywordSuggestions(
  input: {
    idempotencyKey: string;
    keyword: string;
    maxResults?: number;
  },
): Promise<CoupangKeywordSuggestionExtensionReply> {
  const parsedInput = SourcingKeywordSuggestionInputSchema.parse({
    keyword: input.keyword,
    maxResults: input.maxResults ?? COUPANG_KEYWORD_SUGGESTION_MAX_RESULTS,
  });
  const extensionId = await detectExtensionId();
  if (!extensionId) {
    throw new Error('KidItem OS 익스텐션을 연결한 뒤 다시 시도해주세요.');
  }
  const response = await sendToExtension<unknown>(
    extensionId,
    {
      action: COUPANG_KEYWORD_SUGGESTION_EXTENSION_ACTION,
      idempotencyKey: input.idempotencyKey,
      keyword: parsedInput.keyword,
      maxResults: parsedInput.maxResults,
    },
    null,
  );
  if (
    !response ||
    typeof response !== 'object' ||
    Array.isArray(response) ||
    typeof (response as { success?: unknown }).success !== 'boolean'
  ) {
    throw new Error('KidItem OS 익스텐션이 쿠팡 키워드 수집 결과를 올바르게 반환하지 않았습니다.');
  }
  const record = response as Record<string, unknown>;
  if (typeof record.attemptId !== 'string' || typeof record.state !== 'string') {
    throw new Error(
      typeof record.error === 'string'
        ? record.error
        : 'KidItem OS 익스텐션이 쿠팡 키워드 수집 결과를 올바르게 반환하지 않았습니다.',
    );
  }
  const parsed = ExtensionReplySchema.safeParse(response);
  if (!parsed.success) {
    throw new Error('KidItem OS 익스텐션이 쿠팡 키워드 수집 결과를 올바르게 반환하지 않았습니다.');
  }
  if (parsed.data.success !== (parsed.data.state === 'COMPLETE')) {
    throw new Error('KidItem OS 익스텐션이 쿠팡 키워드 수집 상태를 올바르게 반환하지 않았습니다.');
  }
  return parsed.data;
}

export function isCoupangKeywordSuggestionAttemptNotFound(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}
