'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { OperationRun } from '@kiditem/shared/operations';
import {
  useCancelOperationRun,
  useOperationRun,
  useRetryBrowserOperationRun,
  useStartOperation,
} from '@/hooks/useOperationRun';
import { wakeBrowserOperationRuntime } from '@/lib/extension-bridge';

export interface UseSourcingOperationActionOptions<
  TInput extends Readonly<Record<string, unknown>>,
> {
  operationKey: string;
  input: TInput;
  snapshotQueryKey: QueryKey;
  snapshotQueryKeys?: readonly QueryKey[];
  idempotencyKey?: string;
  initialRunId?: string | null;
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
  const latestStartRequestRef = useRef(0);
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

  const start = useCallback(async (
    input: Readonly<Record<string, unknown>> = options.input,
    snapshotQueryKeys: readonly QueryKey[] =
      options.snapshotQueryKeys ?? [options.snapshotQueryKey],
  ): Promise<OperationRun> => {
    const requestNumber = latestStartRequestRef.current + 1;
    latestStartRequestRef.current = requestNumber;
    const run = await startMutation.mutateAsync({
      operationKey: options.operationKey,
      input: {
        sourceSurface: 'domain_screen',
        input: { ...input },
        idempotencyKey: options.idempotencyKey,
      },
    });
    void wakeBrowserOperationRuntime().catch(() => undefined);

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
    startMutation,
  ]);

  const cancel = useCallback(async (): Promise<OperationRun | null> => {
    const runId = latestRunIdRef.current;
    return runId === null ? null : cancelMutation.mutateAsync(runId);
  }, [cancelMutation]);

  const retryAttention = useCallback(async (): Promise<unknown | null> => {
    const runId = latestRunIdRef.current;
    return runId === null ? null : retryMutation.mutateAsync(runId);
  }, [retryMutation]);

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
