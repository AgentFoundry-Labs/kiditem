'use client';

import { useMemo } from 'react';
import type { OperationRun } from '@kiditem/shared/operations';
import {
  useCancelOperationRun,
  useOperationCatalog,
  useOperationRuns,
  useOperationSchedules,
  useRetryBrowserOperationRun,
  useStartOperation,
  useUpsertOperationSchedule,
} from '@/hooks/useOperationRun';

function latestRunByOperation(runs: OperationRun[]): Map<string, OperationRun> {
  const latest = new Map<string, OperationRun>();
  for (const run of runs) {
    const current = latest.get(run.operationKey);
    if (!current || new Date(run.createdAt) > new Date(current.createdAt)) {
      latest.set(run.operationKey, run);
    }
  }
  return latest;
}

export function useAgentOsOperations() {
  const catalogQuery = useOperationCatalog();
  const runsQuery = useOperationRuns();
  const schedulesQuery = useOperationSchedules();
  const startOperation = useStartOperation();
  const cancelOperation = useCancelOperationRun();
  const retryBrowserOperation = useRetryBrowserOperationRun();
  const saveSchedule = useUpsertOperationSchedule();

  const latestRuns = useMemo(
    () => latestRunByOperation(runsQuery.data?.items ?? []),
    [runsQuery.data?.items],
  );
  const schedules = useMemo(
    () => new Map((schedulesQuery.data?.items ?? []).map((schedule) => [schedule.operationKey, schedule])),
    [schedulesQuery.data?.items],
  );

  return {
    definitions: catalogQuery.data?.items ?? [],
    latestRuns,
    schedules,
    isLoading: catalogQuery.isLoading || runsQuery.isLoading || schedulesQuery.isLoading,
    error: catalogQuery.error ?? runsQuery.error ?? schedulesQuery.error,
    startOperation,
    cancelOperation,
    retryBrowserOperation,
    saveSchedule,
  };
}
