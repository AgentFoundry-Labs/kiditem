'use client';

import { useQuery } from '@tanstack/react-query';
import { operationsApi } from '@/lib/operations-api';
import { queryKeys } from '@/lib/query-keys';
import type { OperationRun } from '@kiditem/shared/operations';

const POLL_INTERVAL_MS = 2_000;

export function isTerminalOperationStatus(status: OperationRun['status']): boolean {
  return ['succeeded', 'failed', 'cancelled', 'skipped'].includes(status);
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
