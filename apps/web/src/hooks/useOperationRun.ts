'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type {
  OperationRun,
  UpsertOperationScheduleRequest,
} from '@kiditem/shared/operations';
import { operationsApi, type StartOperationInput } from '@/lib/operations-api';
import { queryKeys } from '@/lib/query-keys';

const POLL_INTERVAL_MS = 2_000;

export function isTerminalOperationStatus(status: OperationRun['status']): boolean {
  return ['succeeded', 'failed', 'cancelled', 'skipped'].includes(status);
}

export function useOperationCatalog() {
  return useQuery({
    queryKey: queryKeys.operations.catalog(),
    queryFn: operationsApi.listCatalog,
  });
}

export function useOperationRuns() {
  return useQuery({
    queryKey: queryKeys.operations.runs(),
    queryFn: operationsApi.listRuns,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useOperationRun(runId: string | null) {
  return useQuery({
    queryKey: queryKeys.operations.run(runId ?? 'not-requested'),
    queryFn: () => operationsApi.getRun(runId!),
    enabled: runId !== null,
    refetchInterval: (query) => {
      if (query.state.status === 'error') return false;
      const run = query.state.data;
      return run && isTerminalOperationStatus(run.status)
        ? false
        : POLL_INTERVAL_MS;
    },
  });
}

export function useReconnectableOperationRun(
  operationKey: string,
  input: Record<string, unknown> | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.operations.reconnect(operationKey, input),
    queryFn: () => operationsApi.findReconnectable(operationKey, input),
    enabled,
    staleTime: 15_000,
  });
}

export function useOperationSchedules() {
  return useQuery({
    queryKey: queryKeys.operations.schedules(),
    queryFn: operationsApi.listSchedules,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useStartOperation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ operationKey, input }: { operationKey: string; input: StartOperationInput }) =>
      operationsApi.start(operationKey, input),
    onSuccess: (run) => {
      queryClient.setQueryData(queryKeys.operations.run(run.id), run);
      return queryClient.invalidateQueries({ queryKey: queryKeys.operations.runs() });
    },
  });
}

export function useCancelOperationRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: operationsApi.cancel,
    onSuccess: (run) => {
      queryClient.setQueryData(queryKeys.operations.run(run.id), run);
      return queryClient.invalidateQueries({ queryKey: queryKeys.operations.runs() });
    },
  });
}

export function useRetryBrowserOperationRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: operationsApi.retryBrowserRun,
    onSuccess: (replacementRun, runId) => {
      queryClient.setQueryData(
        queryKeys.operations.run(replacementRun.id),
        replacementRun,
      );
      invalidateAfterRetry(queryClient, queryKeys.operations.run(runId));
      invalidateAfterRetry(queryClient, queryKeys.operations.runs());
    },
  });
}

function invalidateAfterRetry(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: QueryKey,
) {
  void queryClient.invalidateQueries({ queryKey }).catch(() => undefined);
}

export function useUpsertOperationSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ operationKey, request }: {
      operationKey: string;
      request: UpsertOperationScheduleRequest;
    }) => operationsApi.upsertSchedule(operationKey, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.operations.schedules() }),
  });
}

export function useDisableOperationSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: operationsApi.disableSchedule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.operations.schedules() }),
  });
}
