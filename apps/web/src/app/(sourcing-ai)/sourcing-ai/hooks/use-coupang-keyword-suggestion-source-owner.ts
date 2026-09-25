'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SOURCING_OPERATION_KINDS } from '@kiditem/shared/sourcing-operation';
import { COLLECTION_IDLE_POLL_MS, COLLECTION_RUNNING_POLL_MS } from '@/hooks/use-collection-source-control';
import { requestOperationStart, type OperationStartOutcome } from '@/lib/operation-start';
import { keywordSuggestionSnapshotQueryKey, normalizeCoupangKeyword } from '../keywords/lib/coupang-keyword-snapshot-api';
import { isLiveOperation, sourcingOperationState, sourcingOperationsQueryOptions } from '../lib/sourcing-operations';
import type { OperationView } from '@kiditem/shared/operation';

/** 쿠팡 검색창 추천 키워드 상한(옛 attempt plan과 같다). */
export const COUPANG_KEYWORD_SUGGESTION_MAX_RESULTS = 30;

const KIND = SOURCING_OPERATION_KINDS.coupangKeywordSuggestion;

/**
 * 화면이 보는 수집 한 번. 실행 상태를 옛 attempt 상태 말로 옮긴다 — 중단은 `*_CANCELLED` 코드의 FAILED라
 * `attemptFailureText`가 "수집을 중단했습니다"로 말한다.
 */
export type CoupangKeywordSuggestionCollection = Readonly<{
  attemptId: string;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  errorCode: string | null;
  errorMessage: string | null;
}>;

export type CoupangKeywordSuggestionSourceOwnerView = {
  latestAttempt: CoupangKeywordSuggestionCollection | null;
  latestComplete: CoupangKeywordSuggestionCollection | null;
  error: string | null;
  isLoading: boolean;
  isCollecting: boolean;
  collect: (keyword?: string) => Promise<OperationStartOutcome>;
};

function normalizedKeywordOrNull(keyword: unknown): string | null {
  if (typeof keyword !== 'string') return null;
  try {
    return normalizeCoupangKeyword(keyword);
  } catch {
    return null;
  }
}

function toCollection(operation: OperationView | null): CoupangKeywordSuggestionCollection | null {
  if (!operation) return null;
  return {
    attemptId: operation.id,
    state: isLiveOperation(operation) ? 'RUNNING' : operation.status === 'succeeded' ? 'COMPLETE' : 'FAILED',
    errorCode: operation.errorCode,
    errorMessage: operation.errorMessage,
  };
}

/**
 * 키워드 화면의 쿠팡 추천 키워드 수집(`sourcing.coupang_keyword_suggestion`, KID-360). 조직의 이 kind 실행을 한 번
 * 읽고 이 키워드(plan.keyword)의 것만 본다. 수집 버튼만 확장에 `operation.start`를 보낸다 — 같은 키워드 재요청의
 * 멱등은 확장 runner와 서버 잠금(`resource:coupang:keyword…`)이 맡는다. 새 성공이 보이면 저장된 스냅샷을 다시 읽는다.
 */
export function useCoupangKeywordSuggestionSourceOwner({
  keyword,
}: {
  keyword: string;
}): CoupangKeywordSuggestionSourceOwnerView {
  const queryClient = useQueryClient();
  const normalizedKeyword = useMemo(() => normalizedKeywordOrNull(keyword), [keyword]);
  const invalidatedCompleteRef = useRef<string | null>(null);

  const statusOptions = sourcingOperationsQueryOptions(KIND);
  const statusQuery = useQuery({
    ...statusOptions,
    refetchInterval: (query) =>
      query.state.status !== 'error' && query.state.data?.operations.some(isLiveOperation)
        ? COLLECTION_RUNNING_POLL_MS
        : COLLECTION_IDLE_POLL_MS,
  });
  const match = useCallback(
    (operation: OperationView) =>
      normalizedKeyword !== null && normalizedKeywordOrNull(operation.plan?.keyword) === normalizedKeyword,
    [normalizedKeyword],
  );
  const { latest, lastSucceeded } = sourcingOperationState(statusQuery.data, match);

  const start = useMutation({
    mutationFn: async (requested: string) => {
      const outcome = await requestOperationStart(KIND, { keyword: requested, maxResults: COUPANG_KEYWORD_SUGGESTION_MAX_RESULTS });
      if (outcome.outcome === 'refused') throw new Error(outcome.message);
      await queryClient.invalidateQueries({ queryKey: statusOptions.queryKey, exact: true });
      return outcome;
    },
  });
  const { mutateAsync, reset } = start;

  useEffect(() => {
    reset();
  }, [normalizedKeyword, reset]);

  const collect = useCallback(async (requestedKeyword?: string) => {
    const requested = normalizedKeywordOrNull(requestedKeyword ?? keyword);
    if (!requested) throw new Error('수집할 키워드를 입력해주세요.');
    return mutateAsync(requested);
  }, [keyword, mutateAsync]);

  useEffect(() => {
    if (latest?.status !== 'succeeded' || !normalizedKeyword) return;
    if (invalidatedCompleteRef.current === latest.id) return;
    invalidatedCompleteRef.current = latest.id;
    void queryClient.invalidateQueries({
      queryKey: keywordSuggestionSnapshotQueryKey(normalizedKeyword),
      exact: true,
    });
  }, [latest, normalizedKeyword, queryClient]);

  const latestAttempt = toCollection(latest);
  return {
    latestAttempt,
    latestComplete: toCollection(lastSucceeded),
    error: start.error instanceof Error
      ? start.error.message
      : statusQuery.error instanceof Error ? statusQuery.error.message : null,
    isLoading: statusQuery.isLoading,
    isCollecting: start.isPending || latestAttempt?.state === 'RUNNING',
    collect,
  };
}
