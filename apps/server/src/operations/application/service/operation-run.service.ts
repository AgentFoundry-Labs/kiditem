import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { OperationRun, OperationStatus } from '@kiditem/shared/operations';
import type {
  CancelOperationRunCommand,
  ListOperationRunsQuery,
  OperationRunnerPort,
  StartOperationCommand,
} from '../port/in/operation-runner.port';
import { OPERATION_HANDLER_REGISTRY_PORT } from '../port/in/operation-handler-registry.port';
import { OPERATION_REPOSITORY_PORT } from '../port/out/repository/operation.repository.port';
import type {
  OperationRunRecord,
  OperationRunRepositoryPort,
} from '../port/out/repository/operation.repository.port';
import type { OperationHandlerRegistryPort } from '../port/in/operation-handler-registry.port';

const CANCELLABLE_OPERATION_STATUSES: OperationStatus[] = [
  'queued',
  'waiting_runtime',
  'running',
  'attention_required',
];

@Injectable()
export class OperationRunService implements OperationRunnerPort {
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    @Inject(OPERATION_REPOSITORY_PORT)
    private readonly repository: OperationRunRepositoryPort,
  ) {}

  async start(command: StartOperationCommand): Promise<OperationRun> {
    const definition = this.registry.getDefinition(command.operationKey);
    if (!definition.allowedTriggers.includes(command.triggerSource)) {
      throw new Error(`trigger_not_allowed: ${command.triggerSource}`);
    }
    const input = this.registry.parseInput(command.operationKey, command.input);

    if (command.idempotencyKey !== null) {
      const existing = await this.repository.findByIdempotencyKey({
        organizationId: command.organizationId,
        operationKey: command.operationKey,
        idempotencyKey: command.idempotencyKey,
      });
      if (existing) return this.toWire(existing);
    }

    return this.toWire(
      await this.repository.createRun({
        organizationId: command.organizationId,
        operationKey: definition.key,
        definitionVersion: definition.version,
        ownerDomain: definition.ownerDomain,
        title: definition.title,
        engineType: definition.engineType,
        triggerSource: command.triggerSource,
        requestedByUserId: command.requestedByUserId,
        parentRunId: command.parentRunId ?? null,
        scheduleId: command.scheduleId ?? null,
        idempotencyKey: command.idempotencyKey,
        input,
        maxAttempts: definition.maxAttempts,
        scheduledFor: command.scheduledFor ?? null,
      }),
    );
  }

  async list(query: ListOperationRunsQuery): Promise<OperationRun[]> {
    const records = await this.repository.listRuns({
      organizationId: query.organizationId,
      status: query.status,
      limit: Math.min(Math.max(query.limit ?? 50, 1), 100),
    });
    return records.map((record) => this.toWire(record));
  }

  async get(organizationId: string, runId: string): Promise<OperationRun> {
    const record = await this.repository.findRunById({ organizationId, runId });
    if (!record) throw new NotFoundException('operation_run_not_found');
    return this.toWire(record);
  }

  async cancel(command: CancelOperationRunCommand): Promise<OperationRun> {
    const existing = await this.repository.findRunById({
      organizationId: command.organizationId,
      runId: command.runId,
    });
    if (!existing) throw new NotFoundException('operation_run_not_found');

    if (!CANCELLABLE_OPERATION_STATUSES.includes(existing.status)) {
      return this.toWire(existing);
    }

    const cancelled = await this.repository.transition({
      organizationId: command.organizationId,
      runId: command.runId,
      expectedStatuses: CANCELLABLE_OPERATION_STATUSES,
      status: 'cancelled',
      errorCode: command.reason ? 'cancelled_by_operator' : null,
      errorMessage: command.reason ?? null,
      finishedAt: new Date(),
    });
    return this.toWire(cancelled ?? (await this.require(command.organizationId, command.runId)));
  }

  private async require(
    organizationId: string,
    runId: string,
  ): Promise<OperationRunRecord> {
    const record = await this.repository.findRunById({ organizationId, runId });
    if (!record) throw new NotFoundException('operation_run_not_found');
    return record;
  }

  private toWire(record: OperationRunRecord): OperationRun {
    return {
      id: record.id,
      operationKey: record.operationKey,
      definitionVersion: record.definitionVersion,
      title: record.title,
      ownerDomain: record.ownerDomain,
      engineType: record.engineType,
      status: record.status,
      triggerSource: record.triggerSource,
      parentRunId: record.parentRunId,
      scheduleId: record.scheduleId,
      nativeRunType: record.nativeRunType,
      nativeRunId: record.nativeRunId,
      progress: record.progress,
      result: record.result,
      error:
        record.errorCode === null && record.errorMessage === null
          ? null
          : {
              code: record.errorCode ?? 'operation_execution_failed',
              message: record.errorMessage ?? record.errorCode ?? 'Operation failed',
            },
      requestedBy: record.requestedBy,
      scheduledFor: record.scheduledFor,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    } satisfies OperationRun;
  }
}
