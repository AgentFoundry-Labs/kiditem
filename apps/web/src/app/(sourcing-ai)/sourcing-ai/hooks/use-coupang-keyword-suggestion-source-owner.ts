'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { queryKeys } from '@/lib/query-keys';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import {
  clearActiveCoupangKeywordSuggestionAttempt,
  collectSourcingKeywordSuggestions,
  COUPANG_KEYWORD_SUGGESTION_MAX_RESULTS,
  fetchCoupangKeywordSuggestionSourceStatus,
  getCoupangKeywordSuggestionEnvironmentKey,
  isCoupangKeywordSuggestionAttemptNotFound,
  readActiveCoupangKeywordSuggestionAttempt,
  readCoupangKeywordSuggestionSourceAttempt,
  rememberActiveCoupangKeywordSuggestionAttempt,
  type ActiveCoupangKeywordSuggestionAttempt,
  type CoupangKeywordSuggestionSourceAttempt,
  type CoupangKeywordSuggestionSourceStatus,
} from '../keywords/lib/coupang-keyword-source-owner';
import { keywordSuggestionSnapshotQueryKey, normalizeCoupangKeyword } from '../keywords/lib/coupang-keyword-snapshot-api';

export type CoupangKeywordSuggestionSourceOwnerView = {
  status: CoupangKeywordSuggestionSourceStatus | null;
  latestAttempt: CoupangKeywordSuggestionSourceAttempt | null;
  latestComplete: CoupangKeywordSuggestionSourceAttempt | null;
  error: string | null;
  isLoading: boolean;
  isCollecting: boolean;
  collect: (keyword?: string) => Promise<CoupangKeywordSuggestionSourceAttempt>;
};

function sourceStatusQueryKey(keyword: string) {
  return [...queryKeys.sourcing.keywordSuggestions(keyword), 'source-status'] as const;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizedKeywordOrNull(keyword: string): string | null {
  try {
    return normalizeCoupangKeyword(keyword);
  } catch {
    return null;
  }
}

function sameKeyword(left: string, right: string): boolean {
  return normalizedKeywordOrNull(left) === normalizedKeywordOrNull(right);
}

/**
 * The keyword screen owns the explicit source CTA. Reads observe the owner
 * attempt and current snapshot; only collect() sends provider work to the
 * extension.
 */
export function useCoupangKeywordSuggestionSourceOwner({
  keyword,
}: {
  keyword: string;
}): CoupangKeywordSuggestionSourceOwnerView {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const organizationId = user?.organizationId ?? null;
  const environmentKey = getCoupangKeywordSuggestionEnvironmentKey();
  const normalizedKeyword = useMemo(() => normalizedKeywordOrNull(keyword), [keyword]);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const startingRef = useRef(false);
  const invalidatedCompleteRef = useRef<string | null>(null);

  useEffect(() => {
    setCommandError(null);
  }, [environmentKey, normalizedKeyword, organizationId]);

  const statusKey = normalizedKeyword
    ? sourceStatusQueryKey(normalizedKeyword)
    : [...queryKeys.sourcing.keywordSuggestions(''), 'source-status', 'none'] as const;
  const statusQuery = useQuery(collectionSourceStatusQueryOptions({
    queryKey: statusKey,
    queryFn: () => fetchCoupangKeywordSuggestionSourceStatus(normalizedKeyword!),
    enabled: Boolean(organizationId && normalizedKeyword),
    refetchInterval: (query) => (
      query.state.data?.latestAttempt?.state === 'RUNNING' ? 2_000 : false
    ),
    refetchIntervalInBackground: false,
    meta: { suppressGlobalErrorToast: true },
  }));

  const collect = useCallback(async (requestedKeyword?: string) => {
    if (!organizationId) {
      throw new Error('쿠팡 키워드 수집을 시작할 조직 정보가 없습니다. 다시 로그인해 주세요.');
    }
    const requested = normalizedKeywordOrNull(requestedKeyword ?? keyword);
    if (!requested) {
      throw new Error('수집할 키워드를 입력해주세요.');
    }
    if (startingRef.current) {
      throw new Error('쿠팡 키워드 수집이 이미 시작되었습니다.');
    }
    startingRef.current = true;
    setIsStarting(true);
    setCommandError(null);
    try {
      let persisted = readActiveCoupangKeywordSuggestionAttempt(
        organizationId,
        requested,
        environmentKey,
      );
      if (persisted && (!sameKeyword(persisted.keyword, requested)
        || persisted.maxResults !== COUPANG_KEYWORD_SUGGESTION_MAX_RESULTS)) {
        clearActiveCoupangKeywordSuggestionAttempt(organizationId, requested, environmentKey);
        persisted = null;
      }

      if (persisted?.attemptId) {
        try {
          const current = await readCoupangKeywordSuggestionSourceAttempt(persisted.attemptId);
          if (!sameKeyword(current.plan.keyword, requested)
            || current.plan.maxResults !== COUPANG_KEYWORD_SUGGESTION_MAX_RESULTS) {
            clearActiveCoupangKeywordSuggestionAttempt(organizationId, requested, environmentKey);
            persisted = null;
          } else if (current.state !== 'RUNNING') {
            clearActiveCoupangKeywordSuggestionAttempt(organizationId, requested, environmentKey);
            persisted = null;
          }
        } catch (error) {
          if (!isCoupangKeywordSuggestionAttemptNotFound(error)) throw error;
          // Only this explicit CTA clears a foreign/stale persisted reference.
          clearActiveCoupangKeywordSuggestionAttempt(organizationId, requested, environmentKey);
          persisted = null;
        }
      }

      const idempotencyKey = persisted?.idempotencyKey ?? createSecureRandomUuid();
      const pending: ActiveCoupangKeywordSuggestionAttempt = {
        attemptId: persisted?.attemptId ?? null,
        idempotencyKey,
        keyword: requested,
        maxResults: COUPANG_KEYWORD_SUGGESTION_MAX_RESULTS,
      };
      // Persist before dispatch so a lost extension response replays exactly
      // this explicit request and cannot create a second owner attempt.
      rememberActiveCoupangKeywordSuggestionAttempt(organizationId, pending, environmentKey);

      const reply = await collectSourcingKeywordSuggestions({
        idempotencyKey,
        keyword: requested,
        maxResults: COUPANG_KEYWORD_SUGGESTION_MAX_RESULTS,
      });
      if (persisted?.attemptId && reply.attemptId !== persisted.attemptId) {
        throw new Error('쿠팡 키워드 수집 응답의 owner 시도가 일치하지 않습니다.');
      }

      const observed = await readCoupangKeywordSuggestionSourceAttempt(reply.attemptId);
      if (!sameKeyword(observed.plan.keyword, requested)
        || observed.plan.maxResults !== COUPANG_KEYWORD_SUGGESTION_MAX_RESULTS) {
        throw new Error('쿠팡 키워드 수집 owner 계획이 요청과 일치하지 않습니다.');
      }
      rememberActiveCoupangKeywordSuggestionAttempt(
        organizationId,
        { ...pending, attemptId: observed.attemptId },
        environmentKey,
      );
      await queryClient.invalidateQueries({ queryKey: sourceStatusQueryKey(requested), exact: true });

      if (observed.state === 'COMPLETE') {
        clearActiveCoupangKeywordSuggestionAttempt(organizationId, requested, environmentKey);
        await queryClient.invalidateQueries({
          queryKey: keywordSuggestionSnapshotQueryKey(requested),
          exact: true,
        });
      } else if (observed.state === 'FAILED') {
        clearActiveCoupangKeywordSuggestionAttempt(organizationId, requested, environmentKey);
      }
      return observed;
    } catch (error) {
      setCommandError(errorMessage(error));
      throw error;
    } finally {
      startingRef.current = false;
      setIsStarting(false);
    }
  }, [
    environmentKey,
    keyword,
    organizationId,
    queryClient,
  ]);

  const latestAttempt = statusQuery.data?.latestAttempt ?? null;
  const latestComplete = statusQuery.data?.latestComplete ?? null;
  const isCollecting = isStarting || latestAttempt?.state === 'RUNNING';
  const sourceError = commandError
    ?? (statusQuery.error instanceof Error ? statusQuery.error.message : null);

  useEffect(() => {
    if (latestAttempt?.state !== 'COMPLETE' || !normalizedKeyword) return;
    if (invalidatedCompleteRef.current === latestAttempt.attemptId) return;
    invalidatedCompleteRef.current = latestAttempt.attemptId;
    void queryClient.invalidateQueries({
      queryKey: keywordSuggestionSnapshotQueryKey(normalizedKeyword),
      exact: true,
    });
  }, [latestAttempt, normalizedKeyword, queryClient]);

  return {
    status: statusQuery.data ?? null,
    latestAttempt,
    latestComplete,
    error: sourceError,
    isLoading: statusQuery.isLoading,
    isCollecting,
    collect,
  };
}
