function parseEnabled(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveOperationRuntimeWorkerEnabled(): boolean {
  return parseEnabled(process.env.OPERATION_RUNTIME_WORKER_ENABLED);
}

export function resolveOperationRuntimeWorkerIntervalMs(): number {
  return parsePositiveInteger(process.env.OPERATION_RUNTIME_WORKER_INTERVAL_MS, 2_000);
}

export function resolveOperationSchedulerEnabled(): boolean {
  return parseEnabled(process.env.OPERATION_SCHEDULER_ENABLED);
}

export function resolveOperationSchedulerIntervalMs(): number {
  return parsePositiveInteger(process.env.OPERATION_SCHEDULER_INTERVAL_MS, 30_000);
}

export function resolveOperationRunLeaseMs(): number {
  return parsePositiveInteger(process.env.OPERATION_RUN_LEASE_MS, 60_000);
}
