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
/** React Query's own doubling ceiling, for a failure whose response named no wait. */
const MAX_DOUBLED_DELAY_MS = 30_000;
/** However long a throttler asks for, a status this stale is worth re-reading. */
const MAX_RETRY_AFTER_MS = 60_000;
/**
 * A `Retry-After` moment already past reads as a zero wait, and React Query
 * takes `refetchInterval: 0` for no interval at all, which would leave a failed
 * status read never asking again. A throttled read waits at least this long.
 */
const MIN_RETRY_AFTER_MS = 1_000;

/**
 * Only failures that can clear by themselves are retried: no response, a
 * client deadline, a throttled request, or a 5xx. Authentication, organization
 * context, other 4xx, and schema drift will not change by asking again.
 */
function isTransientStatusReadFailure(error: unknown): boolean {
  if (error instanceof ZodError || !isApiError(error)) return false;
  if (error.status === 0) {
    return error.code === 'network_error' || error.code === 'request_timeout';
  }
  return error.status === 429 || error.status >= 500;
}

/** The wait the failing response itself named, held between a second and a minute. */
function namedWait(error: unknown): number | null {
  const wait = isApiError(error) ? error.details.retryAfterMs : undefined;
  if (wait === undefined) return null;
  return Math.min(Math.max(wait, MIN_RETRY_AFTER_MS), MAX_RETRY_AFTER_MS);
}

/**
 * The shared read rule for collection source-status queries. Transient
 * failures retry up to three times with doubling delays, except that a
 * response naming its own `Retry-After` — a throttled read — is asked again on
 * that clock rather than on a guess; while the query is in error it reads
 * again every 30 seconds, or after that named wait, so a status recovers
 * without operator action, and the global error toast fires once per failure
 * streak; otherwise the caller's own `refetchInterval` (such as the faster
 * poll while an attempt is RUNNING) stays in charge. Every other option,
 * including `meta.suppressGlobalErrorToast`, passes through.
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
    retry: (failureCount, error) =>
      failureCount < MAX_TRANSIENT_RETRIES && isTransientStatusReadFailure(error),
    // A failure that named its own wait is asked again then; every other one
    // keeps React Query's doubling default (1s, 2s, 4s).
    retryDelay: (failureCount, error) =>
      namedWait(error) ?? Math.min(1_000 * 2 ** failureCount, MAX_DOUBLED_DELAY_MS),
    refetchInterval: (query) => {
      if (query.state.status === 'error') {
        return namedWait(query.state.error) ?? ERROR_REFETCH_MS;
      }
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
