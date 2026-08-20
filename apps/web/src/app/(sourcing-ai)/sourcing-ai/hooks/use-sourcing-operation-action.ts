'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  useCancelOperationRun,
  useOperationRun,
  useReconnectableOperationRun,
  useRetryBrowserOperationRun,
  useStartOperation,
} from '@/hooks/useOperationRun';
import { wakeBrowserOperationRuntime } from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import type { OperationRun } from '@kiditem/shared/operations';

export interface UseSourcingOperationActionOptions<
  TInput extends Readonly<Record<string, unknown>>,
> {
  operationKey: string;
  input: TInput;
  snapshotQueryKey: QueryKey;
  snapshotQueryKeys?: readonly QueryKey[];
  idempotencyKey?: string;
  initialRunId?: string | null;
  /** Optional static identity; dynamic forms reconnect only an unambiguous owned run. */
  reconnectInput?: TInput;
  wakeBrowserRuntime?: boolean;
}

export function useSourcingOperationAction<
  TInput extends Readonly<Record<string, unknown>>,
>(options: UseSourcingOperationActionOptions<TInput>) {
  const queryClient = useQueryClient();
  const startMutation = useStartOperation();
  const cancelMutation = useCancelOperationRun();
  const retryMutation = useRetryBrowserOperationRun();
  const [latestRunId, setLatestRunId] = useState<string | null>(
    () => options.initialRunId ?? null,
  );
  const latestRunIdRef = useRef<string | null>(options.initialRunId ?? null);
  const explicitInitialRunIdRef = useRef<string | null>(options.initialRunId ?? null);
  const latestStartRequestRef = useRef(0);
  const latestRetryRequestRef = useRef(0);
  const invalidatedRunIdsRef = useRef(new Set<string>());
  const snapshotQueryKeysByRunIdRef = useRef(
    new Map<string, readonly QueryKey[]>(
      options.initialRunId
        ? [[
            options.initialRunId,
            options.snapshotQueryKeys ?? [options.snapshotQueryKey],
          ]]
        : [],
    ),
  );
  const runQuery = useOperationRun(latestRunId);
  const reconnectQuery = useReconnectableOperationRun(
    options.operationKey,
    options.reconnectInput,
    explicitInitialRunIdRef.current === null && latestRunId === null,
  );

  useEffect(() => {
    const run = reconnectQuery.data;
    if (
      run === null
      || run === undefined
      || explicitInitialRunIdRef.current !== null
      || latestRunIdRef.current !== null
      || ['succeeded', 'failed', 'cancelled', 'skipped'].includes(run.status)
    ) {
      return;
    }
    latestRunIdRef.current = run.id;
    snapshotQueryKeysByRunIdRef.current.set(
      run.id,
      options.snapshotQueryKeys ?? [options.snapshotQueryKey],
    );
    queryClient.setQueryData(queryKeys.operations.run(run.id), run);
    setLatestRunId(run.id);
  }, [
    options.snapshotQueryKey,
    options.snapshotQueryKeys,
    queryClient,
    reconnectQuery.data,
  ]);

  const start = useCallback(async (
    input: Readonly<Record<string, unknown>> = options.input,
    snapshotQueryKeys: readonly QueryKey[] =
      options.snapshotQueryKeys ?? [options.snapshotQueryKey],
  ): Promise<OperationRun> => {
    const requestNumber = latestStartRequestRef.current + 1;
    latestStartRequestRef.current = requestNumber;
    latestRetryRequestRef.current += 1;
    const run = await startMutation.mutateAsync({
      operationKey: options.operationKey,
      input: {
        sourceSurface: 'domain_screen',
        input: { ...input },
        idempotencyKey: options.idempotencyKey,
      },
    });
    if (options.wakeBrowserRuntime !== false) {
      void wakeBrowserOperationRuntime().catch(() => undefined);
    }

    if (latestStartRequestRef.current === requestNumber) {
      latestRunIdRef.current = run.id;
      snapshotQueryKeysByRunIdRef.current.set(
        run.id,
        snapshotQueryKeys,
      );
      setLatestRunId(run.id);
    }
    return run;
  }, [
    options.idempotencyKey,
    options.input,
    options.operationKey,
    options.snapshotQueryKey,
    options.snapshotQueryKeys,
    options.wakeBrowserRuntime,
    startMutation,
  ]);

  const cancel = useCallback(async (): Promise<OperationRun | null> => {
    const runId = latestRunIdRef.current;
    return runId === null ? null : cancelMutation.mutateAsync(runId);
  }, [cancelMutation]);

  const retryAttention = useCallback(async (): Promise<OperationRun | null> => {
    const runId = latestRunIdRef.current;
    if (runId === null) return null;

    const requestNumber = latestRetryRequestRef.current + 1;
    latestRetryRequestRef.current = requestNumber;
    const replacement = await retryMutation.mutateAsync(runId);
    if (
      latestRetryRequestRef.current === requestNumber
      && latestRunIdRef.current === runId
    ) {
      latestRunIdRef.current = replacement.id;
      snapshotQueryKeysByRunIdRef.current.set(
        replacement.id,
        snapshotQueryKeysByRunIdRef.current.get(runId)
          ?? options.snapshotQueryKeys
          ?? [options.snapshotQueryKey],
      );
      setLatestRunId(replacement.id);
      if (options.wakeBrowserRuntime !== false) {
        void wakeBrowserOperationRuntime().catch(() => undefined);
      }
    }
    return replacement;
  }, [
    options.snapshotQueryKey,
    options.snapshotQueryKeys,
    options.wakeBrowserRuntime,
    retryMutation,
  ]);

  useEffect(() => {
    const run = runQuery.data;
    if (
      run?.status !== 'succeeded'
      || run.id !== latestRunIdRef.current
      || invalidatedRunIdsRef.current.has(run.id)
    ) {
      return;
    }

    invalidatedRunIdsRef.current.add(run.id);
    const snapshotQueryKeys = snapshotQueryKeysByRunIdRef.current.get(run.id);
    if (snapshotQueryKeys) {
      for (const snapshotQueryKey of snapshotQueryKeys) {
        void queryClient.invalidateQueries({ queryKey: snapshotQueryKey });
      }
    }
  }, [queryClient, runQuery.data]);

  return {
    runId: latestRunId,
    run: runQuery.data ?? null,
    runQuery,
    start,
    cancel,
    retryAttention,
    isStarting: startMutation.isPending,
    isCancelling: cancelMutation.isPending,
    isRetrying: retryMutation.isPending,
  };
}
