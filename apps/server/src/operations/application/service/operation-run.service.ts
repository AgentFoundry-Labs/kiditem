import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { OPERATION_HANDLER_REGISTRY_PORT } from '../port/in/operation-handler-registry.port';
import { OPERATION_REPOSITORY_PORT } from '../port/out/repository/operation.repository.port';
import {
  COMPOSITE_OPERATION_COORDINATOR_PORT,
  type CompositeOperationCoordinatorPort,
} from '../port/in/composite-operation-coordinator.port';
import { OperationLifecycleGateService } from './operation-lifecycle-gate.service';
import type { OperationRun, OperationStatus } from '@kiditem/shared/operations';
import type {
  CancelOperationRunCommand,
  ListOperationRunsQuery,
  OperationRunnerPort,
  StartOperationCommand,
} from '../port/in/operation-runner.port';
import type {
  OperationRunRecord,
  OperationRunRepositoryPort,
} from '../port/out/repository/operation.repository.port';
import type { OperationHandlerRegistryPort } from '../port/in/operation-handler-registry.port';

const CANCELLABLE_OPERATION_STATUSES: OperationStatus[] = [
  'queued',
  'waiting_runtime',
  'waiting_dependency',
  'running',
  'attention_required',
];
const RECONNECTABLE_OPERATION_STATUSES = new Set<OperationStatus>(
  CANCELLABLE_OPERATION_STATUSES,
);

@Injectable()
export class OperationRunService implements OperationRunnerPort {
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    @Inject(OPERATION_REPOSITORY_PORT)
    private readonly repository: OperationRunRepositoryPort,
    @Inject(COMPOSITE_OPERATION_COORDINATOR_PORT)
    private readonly compositeCoordinator: CompositeOperationCoordinatorPort,
    private readonly lifecycleGate: OperationLifecycleGateService,
  ) {}

  async start(command: StartOperationCommand): Promise<OperationRun> {
    this.lifecycleGate.assertAccepting();
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

    this.lifecycleGate.assertAccepting();
    const signal = this.lifecycleGate.signal();
    signal.throwIfAborted();
    return this.toWire(
      await this.repository.createRun({
        signal,
        organizationId: command.organizationId,
        operationKey: definition.key,
        definitionVersion: definition.version,
        ownerDomain: definition.ownerDomain,
        title: definition.title,
        engineType: definition.engineType,
        resourceClass: definition.resourceClass,
        executionTimeoutMs: definition.executionTimeoutMs,
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

  async findReconnectable(input: {
    organizationId: string;
    requestedByUserId: string;
    operationKey: string;
    input?: Record<string, unknown>;
  }): Promise<OperationRun | null> {
    const normalizedInput = input.input === undefined
      ? undefined
      : this.registry.parseInput(input.operationKey, input.input);
    const now = await this.repository.readLifecycleDatabaseTime();
    const records = await this.repository.listReconnectableRuns({
      organizationId: input.organizationId,
      requestedByUserId: input.requestedByUserId,
      operationKey: input.operationKey,
      now,
      limit: 50,
    });
    const matching = records.filter((record) =>
      record.requestedByUserId === input.requestedByUserId
      && RECONNECTABLE_OPERATION_STATUSES.has(record.status)
      && (record.deadlineAt === null || record.deadlineAt.getTime() > now.getTime())
      && (normalizedInput === undefined || sameOperationInput(record.input, normalizedInput)),
    );
    return matching.length === 1 ? this.toWire(matching[0]) : null;
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

    const reason = command.reason ?? 'operator_cancelled';
    const cancelled = await this.compositeCoordinator.cancelChildren(existing, reason);
    if (!cancelled) {
      return this.toWire(await this.require(command.organizationId, command.runId));
    }
    await this.registry.getHandler(existing.operationKey).cancel?.({
      runId: existing.id,
      organizationId: existing.organizationId,
      operationKey: existing.operationKey,
      reason,
      requestedByUserId: command.requestedByUserId,
    });
    return this.toWire(cancelled);
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
      resourceClass: record.resourceClass,
      executionTimeoutMs: record.executionTimeoutMs,
      status: record.status,
      triggerSource: record.triggerSource,
      parentRunId: record.parentRunId,
      scheduleId: record.scheduleId,
      nativeRunType: record.nativeRunType,
      nativeRunId: record.nativeRunId,
      progress: record.progress,
      stage: record.stage,
      stageUpdatedAt: record.stageUpdatedAt,
      progressCurrent: record.progressCurrent,
      progressTotal: record.progressTotal,
      deadlineAt: record.deadlineAt,
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

function sameOperationInput(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return JSON.stringify(canonicalizeOperationInput(left))
    === JSON.stringify(canonicalizeOperationInput(right));
}

function canonicalizeOperationInput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeOperationInput);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalizeOperationInput(nested)]),
  );
}
