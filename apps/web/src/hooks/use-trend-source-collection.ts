'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { collectTrendSources } from '@/lib/source-trend-api';
import { queryKeys } from '@/lib/query-keys';

type Status = { latestAttempt: { attemptId: string; state: string; errorMessage: string | null } | null; actualCutoffAt: string | null };

export function useTrendSourceCollection(options: { input?: { sources?: readonly string[] }; snapshotQueryKey?: QueryKey } = {}) {
  const client = useQueryClient();
  const keys = useRef(new Map<string, { key: string; attempts: Array<{ source: string; attemptId: string }> }>());
  const [error, setError] = useState<string | null>(null);
  const sources = options.input?.sources ?? ['naver', 'shorts'];
  const statusKey = [...queryKeys.sourcing.trend(), 'source-status'];
  const status = useQuery(collectionSourceStatusQueryOptions({ queryKey: statusKey, queryFn: () => apiClient.get<Record<string, Status>>('/api/sourcing/trend/status'),
    refetchInterval: (query) => Object.values(query.state.data ?? {}).some((row) => row.latestAttempt?.state === 'RUNNING') ? 2_000 : false }));
  const completedIds = Object.values(status.data ?? {}).filter((row) => row.latestAttempt?.state === 'COMPLETE').map((row) => row.latestAttempt!.attemptId).join(',');
  useEffect(() => {
    if (completedIds) {
      setError(null);
      void client.invalidateQueries({ queryKey: options.snapshotQueryKey ?? queryKeys.sourcing.trend(),
        predicate: (query) => !query.queryKey.includes('source-status') });
    }
  }, [client, completedIds, options.snapshotQueryKey]);
  useEffect(() => {
    for (const [fingerprint, request] of keys.current) {
      if (request.attempts.length && request.attempts.every(({ source, attemptId }) => {
        const terminal = status.data?.[source]?.latestAttempt;
        return terminal?.attemptId === attemptId && terminal.state !== 'RUNNING';
      })) {
        keys.current.delete(fingerprint);
        setError(null);
      }
    }
  }, [status.data]);
  const mutation = useMutation({ mutationFn: async (requested: readonly string[]) => {
    const fingerprint = JSON.stringify(requested);
    const request = keys.current.get(fingerprint) ?? { key: crypto.randomUUID(), attempts: [] };
    keys.current.set(fingerprint, request);
    const result = await collectTrendSources(requested, request.key);
    if (result.results.every((row) => row.state !== 'RUNNING')) keys.current.delete(fingerprint);
    else request.attempts = result.results.flatMap((row) => row.state === 'RUNNING' && row.attemptId
      ? [{ source: row.source, attemptId: row.attemptId }] : []);
    const errors = result.results.filter((row) => !row.ok).map((row) => row.error).filter(Boolean);
    if (errors.length) setError(errors.join('; '));
    await client.invalidateQueries({ queryKey: queryKeys.sourcing.trend() });
    if (options.snapshotQueryKey) await client.invalidateQueries({ queryKey: options.snapshotQueryKey });
    return result;
  } });
  const collect = async (input = options.input ?? {}) => {
    setError(null);
    try { return await mutation.mutateAsync(input.sources ?? sources); }
    catch (cause) { const message = cause instanceof Error ? cause.message : '트렌드 수집 실패';
      setError(message); toast.error(message); return null; }
  };
  const selectedStatus = sources.flatMap((source) => status.data?.[source] ? [status.data[source]] : []);
  return { collect, result: mutation.data ?? null,
    isCollecting: mutation.isPending || selectedStatus.some((row) => row.latestAttempt?.state === 'RUNNING'),
    error: error ?? selectedStatus.find((row) => row.latestAttempt?.state === 'FAILED')?.latestAttempt?.errorMessage ?? null,
    actualCutoffAt: selectedStatus.map((row) => row.actualCutoffAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null };
}
