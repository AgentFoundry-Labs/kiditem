import { QueryObserver, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { startCollectionSource } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import {
  sellpiaInventoryCollection,
  SELLPIA_INVENTORY_SOURCE_PATH,
  SellpiaInventorySourceAttemptSchema,
} from './sellpia-inventory-source-owner';

/** One shared source start, then observe that exact attempt until publication commits.
 * Polling is active only while a calculation waits: at most 60 reads/minute.
 * Aborting a screen stops observation, never another screen's shared collection.
 */
export async function collectSellpiaInventoryBeforeCalculation(
  queryClient: QueryClient,
  organizationId: string | null,
  signal?: AbortSignal,
): Promise<string> {
  if (!organizationId) throw new Error('조직을 선택한 뒤 다시 시도해 주세요.');
  signal?.throwIfAborted();
  const source = sellpiaInventoryCollection({ organizationId });
  const before = await queryClient.fetchQuery({ ...source.statusQuery, staleTime: 0 });
  const started = await startCollectionSource(queryClient, source, undefined);
  if (started.outcome === 'refused') throw new Error(started.message);
  let attemptId = started.attemptId;
  if (!attemptId) {
    // A simultaneous shared start may not yet have returned its attempt identity.
    attemptId = await observeUntil(queryClient, {
      queryKey: source.statusQuery.queryKey,
      queryFn: source.statusQuery.queryFn as () => Promise<typeof before>,
    }, (state) => state.activeSync?.attemptId
      ?? (state.lastCompletedAttemptId !== before.lastCompletedAttemptId
        ? state.lastCompletedAttemptId : null)
      ?? (state.lastAttemptId !== before.lastAttemptId ? state.lastAttemptId : null), signal);
  }
  const id = attemptId;
  return observeUntil(queryClient, {
    queryKey: ['inventory', organizationId, 'collection-attempt', id],
    queryFn: async () => SellpiaInventorySourceAttemptSchema.parse(
      await apiClient.get(`${SELLPIA_INVENTORY_SOURCE_PATH}/attempts/${encodeURIComponent(id)}`),
    ),
  }, (attempt) => {
    if (attempt.state === 'COMPLETE') return attempt.attemptId;
    if (attempt.state === 'FAILED') {
      throw new Error(attempt.errorMessage ?? '재고 수집이 완료되지 않아 계산을 중단했습니다.');
    }
    return null;
  }, signal);
}

function observeUntil<T>(
  client: QueryClient,
  options: { queryKey: QueryKey; queryFn: () => Promise<T> },
  complete: (data: T) => string | null,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const observer = new QueryObserver(client, {
      ...options, staleTime: 0, retry: false,
      refetchInterval: 1_000, refetchIntervalInBackground: true,
    });
    let unsubscribe = () => {};
    const cleanup = () => {
      unsubscribe(); observer.destroy(); clearTimeout(deadline);
      signal?.removeEventListener('abort', abort);
    };
    const fail = (error: unknown) => { cleanup(); reject(error); };
    const abort = () => fail(signal?.reason ?? new Error('Calculation cancelled'));
    const deadline = setTimeout(() => fail(new Error('재고 수집 대기 시간이 초과되었습니다.')), 180_000);
    signal?.addEventListener('abort', abort, { once: true });
    unsubscribe = observer.subscribe((result) => {
      if (result.isError) return fail(result.error);
      if (!result.data) return;
      try {
        const value = complete(result.data);
        if (value) { cleanup(); resolve(value); }
      } catch (error) { fail(error); }
    });
  });
}
