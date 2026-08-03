import { Inject, Injectable } from '@nestjs/common';
import {
  ProductOperationsDataStatusSchema,
  ProductOperationsPeriodDaysSchema,
  type ProductOperationsDataStatus,
} from '@kiditem/shared/product-operations';
import {
  OPERATION_RUNNER_PORT,
  type OperationRunnerPort,
} from '../../../operations/application/port/in/operation-runner.port';
import {
  PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT,
  type ProductOperationsDataStatusRepositoryPort,
} from '../port/out/repository/product-operations-data-status.repository.port';

const PROFITABILITY_OPERATION_KEY = 'products.refresh_profitability_evidence';
const ACTIVE_STATUSES = new Set([
  'queued',
  'waiting_runtime',
  'waiting_dependency',
  'running',
]);

@Injectable()
export class ProductOperationsDataStatusService {
  constructor(
    @Inject(PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT)
    private readonly repository: ProductOperationsDataStatusRepositoryPort,
    @Inject(OPERATION_RUNNER_PORT)
    private readonly operations: OperationRunnerPort,
  ) {}

  async getStatus(
    organizationId: string,
    rawPeriodDays: unknown,
  ): Promise<ProductOperationsDataStatus> {
    const periodDays = ProductOperationsPeriodDaysSchema.parse(rawPeriodDays);
    const [facts, runs] = await Promise.all([
      this.repository.read(organizationId, periodDays),
      this.operations.list({ organizationId, limit: 100 }),
    ]);
    const parentRuns = runs.filter(({ operationKey, parentRunId }) =>
      operationKey === PROFITABILITY_OPERATION_KEY && parentRunId === null);
    const activeRun = parentRuns.find(({ status }) => ACTIVE_STATUSES.has(status)) ?? null;
    const lastCompleted = parentRuns.find(({ status }) => status === 'succeeded') ?? null;
    const latestFailed = parentRuns.find(({ status }) =>
      status === 'failed' || status === 'attention_required') ?? null;
    const sources = activeRun
      ? markUpdatingSource(facts.sources, runs, activeRun.id)
      : latestFailed && (!lastCompleted || latestFailed.updatedAt > lastCompleted.updatedAt)
        ? markFailedSource(
            facts.sources,
            runs,
            latestFailed.id,
            latestFailed.finishedAt instanceof Date
              ? latestFailed.finishedAt.toISOString()
              : latestFailed.finishedAt,
          )
        : facts.sources;

    return ProductOperationsDataStatusSchema.parse({
      ...facts,
      sources,
      lastCompletedRefreshAt: lastCompleted?.finishedAt ?? null,
      activeRun,
    });
  }
}

function markUpdatingSource(
  sources: ProductOperationsDataStatus['sources'],
  runs: Awaited<ReturnType<OperationRunnerPort['list']>>,
  parentRunId: string,
): ProductOperationsDataStatus['sources'] {
  const child = runs.find((run) => run.parentRunId === parentRunId && ACTIVE_STATUSES.has(run.status));
  const key = sourceKeyForOperation(child?.operationKey);
  if (!key) return sources;
  return { ...sources, [key]: { ...sources[key], status: 'UPDATING' } };
}

function markFailedSource(
  sources: ProductOperationsDataStatus['sources'],
  runs: Awaited<ReturnType<OperationRunnerPort['list']>>,
  parentRunId: string,
  failedAt: string | null,
): ProductOperationsDataStatus['sources'] {
  const child = runs.find((run) =>
    run.parentRunId === parentRunId
      && (run.status === 'failed' || run.status === 'attention_required'));
  const key = sourceKeyForOperation(child?.operationKey) ?? 'abc';
  return {
    ...sources,
    [key]: { ...sources[key], status: 'FAILED', lastErrorAt: failedAt },
  };
}

function sourceKeyForOperation(
  operationKey: string | undefined,
): keyof ProductOperationsDataStatus['sources'] | null {
  if (operationKey === 'inventory.refresh_sellpia_snapshot') return 'sellpiaProfit';
  if (operationKey === 'advertising.refresh_profitability_spend') return 'advertising';
  if (operationKey === 'products.recalculate_profitability_abc') return 'abc';
  return null;
}
