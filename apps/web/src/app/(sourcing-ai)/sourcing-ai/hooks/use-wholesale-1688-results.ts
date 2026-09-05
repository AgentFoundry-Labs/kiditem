'use client';

import { useMutation, useQueries, useQuery, useQueryClient, type Query, type QueryKey } from '@tanstack/react-query';
import { isApiError } from '@/lib/api-error';
import { wakeBrowserOperationRuntime } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import {
  fetchWholesale1688Results,
  normalizeWholesale1688ResultQuery,
  wholesale1688ResultsQueryKey,
  type Wholesale1688ResultQuery,
  collectWholesale1688,
  type Wholesale1688Command,
  readWholesale1688Attempt,
  type Wholesale1688Attempt,
} from '../lib/wholesale-1688-results-api';

export function useWholesale1688Results(input: Wholesale1688ResultQuery) {
  const normalized = normalizeWholesale1688ResultQuery(input);
  return useQuery({
    queryKey: wholesale1688ResultsQueryKey(normalized),
    queryFn: () => fetchWholesale1688Results(normalized),
    enabled: normalized.keywords.length > 0 || normalized.targetIds.length > 0,
    refetchInterval: (query) => query.state.data?.sourceStatuses.some((source) => source.refreshing) ? 2_000 : false,
  });
}

export function useWholesale1688Command(snapshotQueryKey: QueryKey) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ command, key }: { command: Wholesale1688Command; key: string }) => ({
      kind: command.kind, attempts: await collectWholesale1688(command, key),
    }),
    retry: (failureCount, error) => failureCount < 1 && isApiError(error) && error.status === 0,
    onSettled: () => queryClient.invalidateQueries({ queryKey: snapshotQueryKey }),
  });
  const attemptQueries = useQueries({
    queries: (mutation.data?.attempts ?? []).map((attempt) => ({
      queryKey: queryKeys.sourcing.wholesale1688Attempt(mutation.data!.kind, attempt.attemptId),
      initialData: attempt,
      enabled: attempt.state === 'RUNNING',
      queryFn: async () => {
        const current = await readWholesale1688Attempt(mutation.data!.kind, attempt.attemptId);
        if (current.state !== 'RUNNING') await queryClient.invalidateQueries({ queryKey: snapshotQueryKey });
        return current;
      },
      refetchInterval: (query: Query<Wholesale1688Attempt>) => query.state.data?.state === 'RUNNING' ? 2_000 : false,
    })),
  });
  return {
    isPending: mutation.isPending || attemptQueries.some((query) => query.data.state === 'RUNNING'),
    attempts: attemptQueries.map((query) => query.data),
    error: mutation.error ?? attemptQueries.find((query) => query.error)?.error,
    start: (command: Wholesale1688Command) => {
      const key = crypto.randomUUID();
      if (command.kind === 'keyword-search') void wakeBrowserOperationRuntime().catch(() => undefined);
      mutation.mutate({ command, key });
    },
  };
}
