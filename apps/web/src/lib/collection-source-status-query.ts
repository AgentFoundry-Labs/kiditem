import { ZodError } from 'zod';
import { isApiError } from './api-error';
import type {
  DefaultError,
  DefinedInitialDataOptions,
  QueryKey,
  UndefinedInitialDataOptions,
  UseQueryOptions,
} from '@tanstack/react-query';

/** Light hint while a failed refetch leaves the last known status in charge. */
export const COLLECTION_SOURCE_STATUS_RECHECKING_MESSAGE = '상태를 다시 확인하는 중';

/** A stopped collection is not a failure: its source keeps the last complete collection. */
export const COLLECTION_STOPPED_MESSAGE = '수집을 중단했습니다. 저장된 완료본은 유지됩니다.';

/**
 * An attempt that ended with a `*_CANCELLED` code was stopped, by an operator
 * or with its browser session, and did not fail. The server's source failure
 * alerts follow the same suffix rule.
 */
export function stoppedAttempt(
  attempt: Readonly<{ state: string; errorCode?: string | null }> | null | undefined,
): boolean {
  return attempt?.state === 'FAILED' && Boolean(attempt.errorCode?.endsWith('_CANCELLED'));
}

const ERROR_REFETCH_MS = 30_000;
const MAX_TRANSIENT_RETRIES = 3;

/**
 * Only failures that can clear by themselves are retried: no response, a
 * client deadline, or a 5xx. Authentication, organization context, other 4xx,
 * and schema drift will not change by asking again.
 */
function isTransientStatusReadFailure(error: unknown): boolean {
  if (error instanceof ZodError || !isApiError(error)) return false;
  if (error.status === 0) {
    return error.code === 'network_error' || error.code === 'request_timeout';
  }
  return error.status >= 500;
}

/**
 * The shared read rule for collection source-status queries. Transient
 * failures retry up to three times with doubling delays; while the query is
 * in error it reads again every 30 seconds so a status recovers without
 * operator action, and the global error toast fires once per failure streak;
 * otherwise the caller's own `refetchInterval` (such as the faster poll while
 * an attempt is RUNNING) stays in charge. Every other option, including
 * `meta.suppressGlobalErrorToast`, passes through.
 */
export function collectionSourceStatusQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: DefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>,
): DefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>;
export function collectionSourceStatusQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UndefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>,
): UndefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>;
export function collectionSourceStatusQueryOptions<
  TQueryFnData,
  TError,
  TData,
  TQueryKey extends QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> {
  const { refetchInterval } = options;
  return {
    ...options,
    // The 30-second re-reads fail again every cycle; the global toast fires once per streak.
    meta: { ...options.meta, globalErrorToastOncePerFailureStreak: true },
    // Delays stay React Query's doubling default (1s, 2s, 4s), which a spec's
    // QueryClient `retryDelay` default can shorten deterministically.
    retry: (failureCount, error) =>
      failureCount < MAX_TRANSIENT_RETRIES && isTransientStatusReadFailure(error),
    refetchInterval: (query) => {
      if (query.state.status === 'error') return ERROR_REFETCH_MS;
      return typeof refetchInterval === 'function' ? refetchInterval(query) : refetchInterval;
    },
  };
}

/**
 * `loading` and `unavailable` have never read a status, so collection stays
 * blocked. `rechecking` keeps acting on the last known status after a failed
 * refetch and shows the light hint instead of an error.
 */
export type CollectionSourceStatusRead = 'loading' | 'unavailable' | 'rechecking' | 'current';

export function collectionSourceStatusRead(
  query: Readonly<{ data: unknown; isError: boolean }>,
): CollectionSourceStatusRead {
  if (query.data === undefined) return query.isError ? 'unavailable' : 'loading';
  return query.isError ? 'rechecking' : 'current';
}
