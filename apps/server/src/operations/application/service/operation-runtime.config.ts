import {
  MAX_OPERATION_PERSISTED_INT,
  type OperationResourceClass,
} from '@kiditem/shared/operations';
import { z } from 'zod';

const ResourceClassLimitSchema = z
  .number()
  .int()
  .positive()
  .max(MAX_OPERATION_PERSISTED_INT);
const OperationResourceClassLimitsSchema = z
  .object({
    default: ResourceClassLimitSchema,
    naver_api: ResourceClassLimitSchema,
    extension_coupang: ResourceClassLimitSchema,
    playwright_1688: ResourceClassLimitSchema,
    snapshot_compute: ResourceClassLimitSchema,
  })
  .strict();

const DEFAULT_RESOURCE_CLASS_LIMITS: Record<OperationResourceClass, number> = {
  default: 2,
  naver_api: 2,
  extension_coupang: 4,
  playwright_1688: 1,
  snapshot_compute: 2,
};

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

export function resolveOperationResourceClassLimits(): Record<
  OperationResourceClass,
  number
> {
  if (process.env.OPERATION_RESOURCE_CLASS_LIMITS !== undefined) {
    try {
      return OperationResourceClassLimitsSchema.parse(
        JSON.parse(process.env.OPERATION_RESOURCE_CLASS_LIMITS),
      );
    } catch {
      throw new Error('operation_resource_class_limits_invalid');
    }
  }
  return { ...DEFAULT_RESOURCE_CLASS_LIMITS };
}
