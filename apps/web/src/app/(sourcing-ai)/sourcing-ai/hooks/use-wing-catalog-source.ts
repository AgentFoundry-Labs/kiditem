'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { queryKeys } from '@/lib/query-keys';
import { cancelWingSourceAttempt, collectWingCatalog, readWingSourceAttempt } from '../lib/sourcing-wing-source-owner';
import type { SourcingWingCatalogBatchInput } from '@kiditem/shared/sourcing';

export function useWingCatalogSource(options: { input: SourcingWingCatalogBatchInput;
  snapshotQueryKey: QueryKey; initialAttemptId?: string | null }) {
  const client = useQueryClient();
  const [attemptId, setAttemptId] = useState(options.initialAttemptId);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const invalidated = useRef<string | null>(null);
  const collection = useMutation({ mutationFn: collectWingCatalog });
  const current = useQuery(collectionSourceStatusQueryOptions({
    queryKey: [...queryKeys.sourcing.all, 'wing-source-attempt', attemptId ?? 'current'],
    queryFn: () => readWingSourceAttempt(attemptId),
    refetchInterval: (query) => collection.isPending || query.state.data?.state === 'RUNNING' ? 1000 : false,
  }));
  const attempt = current.data ?? null;
  useEffect(() => {
    if (attempt?.state === 'COMPLETE' && invalidated.current !== attempt.attemptId) {
      invalidated.current = attempt.attemptId;
      void client.invalidateQueries({ queryKey: options.snapshotQueryKey });
    }
  }, [attempt, client, options.snapshotQueryKey]);
  const cancellation = useMutation({ mutationFn: cancelWingSourceAttempt,
    onSuccess: () => current.refetch() });

  async function start() {
    const fingerprint = JSON.stringify(options.input);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
    setError(null);
    setAttemptId(null);
    try {
      const result = await collection.mutateAsync({ ...options.input, idempotencyKey: request.current.key });
      request.current = null;
      setAttemptId(result.attemptId);
      await client.invalidateQueries({ queryKey: options.snapshotQueryKey });
      return result;
    } catch (cause) {
      if (cause && typeof cause === 'object' && 'terminalState' in cause && cause.terminalState === 'FAILED') request.current = null;
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      toast.error(message);
      return null;
    }
  }

  async function cancel() {
    if (!attempt?.attemptId || attempt.state !== 'RUNNING') return;
    try { await cancellation.mutateAsync(attempt.attemptId); }
    catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); setError(message); toast.error(message); }
  }
  return { attempt, start, cancel, error: error || attempt?.errorMessage || null,
    isStarting: collection.isPending, isRunning: collection.isPending || attempt?.state === 'RUNNING',
    isCancelling: cancellation.isPending };
}
