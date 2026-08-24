import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
import type { OperationExactRunControlPort } from '../port/in/operation-exact-run-control.port';
import type {
  OperationRunRecord,
  OperationRunRepositoryPort,
} from '../port/out/repository/operation.repository.port';
import type { OperationHandlerRegistryPort } from '../port/in/operation-handler-registry.port';
import {
  OPERATION_RUN_EVENTS,
  type OperationRunFinalizedEvent,
} from '../event/operation-run-events';

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
const EXACT_FENCEABLE_OPERATION_STATUSES = new Set<OperationStatus>([
  'queued',
  'waiting_runtime',
  'waiting_dependency',
  'running',
]);
const TERMINAL_OPERATION_STATUSES = new Set<OperationStatus>([
  'succeeded',
  'failed',
  'cancelled',
]);
const NATIVE_FENCE_HOOK_TIMEOUT_MS = 5_000;

@Injectable()
export class OperationRunService
  implements OperationRunnerPort, OperationExactRunControlPort
{
  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    @Inject(OPERATION_REPOSITORY_PORT)
    private readonly repository: OperationRunRepositoryPort,
    @Inject(COMPOSITE_OPERATION_COORDINATOR_PORT)
    private readonly compositeCoordinator: CompositeOperationCoordinatorPort,
    private readonly lifecycleGate: OperationLifecycleGateService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  async start(command: StartOperationCommand): Promise<OperationRun> {
    this.lifecycleGate.assertAccepting();
    const definition = this.registry.getDefinition(command.operationKey);
    if (definition.successPersistence === 'ephemeral_on_success') {
      throw new NotFoundException('operation_not_found');
    }
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
      if (existing) {
        this.assertMatchingIdempotencyInput(existing.input, input);
        return this.toWire(existing);
      }
    }

    this.lifecycleGate.assertAccepting();
    const signal = this.lifecycleGate.signal();
    signal.throwIfAborted();
    const created = await this.repository.createRun({
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
    });
    if (command.idempotencyKey !== null) {
      this.assertMatchingIdempotencyInput(created.input, input);
    }
    return this.toWire(created);
  }

  async findByIdempotency(input: {
    organizationId: string;
    operationKey: string;
    idempotencyKey: string;
  }): Promise<OperationRun | null> {
    const existing = await this.repository.findByIdempotencyKey(input);
    return existing && !this.isEphemeral(existing) ? this.toWire(existing) : null;
  }

  private assertMatchingIdempotencyInput(
    existing: Record<string, unknown>,
    requested: Record<string, unknown>,
  ): void {
    if (!sameOperationInput(existing, requested)) {
      throw new Error('idempotency_key_input_conflict');
    }
  }

  async list(query: ListOperationRunsQuery): Promise<OperationRun[]> {
    const records = await this.repository.listRuns({
      organizationId: query.organizationId,
      status: query.status,
      limit: Math.min(Math.max(query.limit ?? 50, 1), 100),
      excludedOperationKeys: this.registry.listDefinitions()
        .filter((definition) => definition.successPersistence === 'ephemeral_on_success')
        .map((definition) => definition.key),
    });
    return records
      .filter((record) => !this.isEphemeral(record))
      .map((record) => this.toWire(record));
  }

  async findReconnectable(input: {
    organizationId: string;
    requestedByUserId: string;
    operationKey: string;
    input?: Record<string, unknown>;
  }): Promise<OperationRun | null> {
    const definition = this.registry.getDefinition(input.operationKey);
    if (definition.successPersistence === 'ephemeral_on_success') return null;
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
    if (!record || this.isEphemeral(record)) {
      throw new NotFoundException('operation_run_not_found');
    }
    return this.toWire(record);
  }

  async cancel(command: CancelOperationRunCommand): Promise<OperationRun> {
    const existing = await this.repository.findRunById({
      organizationId: command.organizationId,
      runId: command.runId,
    });
    if (!existing || this.isEphemeral(existing)) {
      throw new NotFoundException('operation_run_not_found');
    }

    if (!CANCELLABLE_OPERATION_STATUSES.includes(existing.status)) {
      return this.toWire(existing);
    }

    const reason = command.reason ?? 'operator_cancelled';
    await this.registry.getHandler(existing.operationKey).cancel?.({
      runId: existing.id,
      organizationId: existing.organizationId,
      operationKey: existing.operationKey,
      reason,
      requestedByUserId: command.requestedByUserId,
    });
    const cancelled = await this.compositeCoordinator.cancelChildren(existing, reason);
    if (!cancelled) {
      return this.toWire(await this.require(command.organizationId, command.runId));
    }
    this.publishLifecycle(cancelled, 'cancelled');
    return this.toWire(cancelled);
  }

  async fenceAndCancel(input: {
    signal: AbortSignal;
    organizationId: string;
    runs: ReadonlyArray<{
      runId: string;
      operationKey: string;
      expectedAttemptToken: string | null;
    }>;
    reason: string;
  }): Promise<ReadonlyArray<{
    runId: string;
    state: 'terminal' | 'fenced' | 'unknown';
    nativeRunType: string | null;
    nativeRunId: string | null;
  }>> {
    const results = [];
    for (const requested of input.runs) {
      results.push(await this.fenceExactRun(input, requested));
    }
    return results;
  }

  private async fenceExactRun(
    input: {
      signal: AbortSignal;
      organizationId: string;
      reason: string;
    },
    requested: {
      runId: string;
      operationKey: string;
      expectedAttemptToken: string | null;
    },
  ): Promise<{
    runId: string;
    state: 'terminal' | 'fenced' | 'unknown';
    nativeRunType: string | null;
    nativeRunId: string | null;
  }> {
    let snapshot: OperationRunRecord | null = null;
    try {
      input.signal.throwIfAborted();
      snapshot = await this.repository.findRunById({
        organizationId: input.organizationId,
        runId: requested.runId,
      });
      const coordinates = {
        nativeRunType: snapshot?.nativeRunType ?? null,
        nativeRunId: snapshot?.nativeRunId ?? null,
      };
      if (
        !snapshot ||
        snapshot.operationKey !== requested.operationKey ||
        snapshot.organizationId !== input.organizationId
      ) {
        return { runId: requested.runId, state: 'unknown', ...coordinates };
      }
      if (snapshot.attemptToken !== requested.expectedAttemptToken) {
        return { runId: requested.runId, state: 'unknown', ...coordinates };
      }
      if (TERMINAL_OPERATION_STATUSES.has(snapshot.status)) {
        if (this.hasNativeAuthority(snapshot)) {
          const fenced = await this.cancelAndFenceNativeAuthority(
            snapshot,
            input,
          );
          return {
            runId: requested.runId,
            state: fenced ? 'fenced' : 'unknown',
            ...coordinates,
          };
        }
        return { runId: requested.runId, state: 'terminal', ...coordinates };
      }
      if (
        !EXACT_FENCEABLE_OPERATION_STATUSES.has(snapshot.status)
      ) {
        return { runId: requested.runId, state: 'unknown', ...coordinates };
      }

      const fenced = await this.repository.transition({
        signal: input.signal,
        organizationId: input.organizationId,
        runId: requested.runId,
        expectedStatuses: [snapshot.status],
        expectedAttemptToken: requested.expectedAttemptToken,
        status: 'cancelled',
        errorCode: 'operation_exact_run_fenced',
        errorMessage: input.reason,
        finishedAt: new Date(),
        claimedBy: null,
        attemptToken: null,
        claimedAt: null,
        leaseExpiresAt: null,
      });
      if (
        !fenced ||
        fenced.operationKey !== snapshot.operationKey ||
        fenced.nativeRunType !== snapshot.nativeRunType ||
        fenced.nativeRunId !== snapshot.nativeRunId
      ) {
        return { runId: requested.runId, state: 'unknown', ...coordinates };
      }

      if (this.hasNativeAuthority(snapshot)) {
        const externalAuthorityFenced = await this.cancelAndFenceNativeAuthority(
          snapshot,
          input,
        );
        if (!externalAuthorityFenced) {
          return { runId: requested.runId, state: 'unknown', ...coordinates };
        }
      } else {
        const handler = this.registry.getHandler(snapshot.operationKey);
        await settleWithAbort(
          handler.cancel?.({
            runId: snapshot.id,
            organizationId: snapshot.organizationId,
            operationKey: snapshot.operationKey,
            reason: input.reason,
            requestedByUserId: null,
          }),
          input.signal,
          NATIVE_FENCE_HOOK_TIMEOUT_MS,
        );
      }
      this.publishLifecycle(fenced, 'cancelled');
      return { runId: requested.runId, state: 'fenced', ...coordinates };
    } catch {
      if (input.signal.aborted) throw input.signal.reason;
      return {
        runId: requested.runId,
        state: 'unknown',
        nativeRunType: snapshot?.nativeRunType ?? null,
        nativeRunId: snapshot?.nativeRunId ?? null,
      };
    }
  }

  private hasNativeAuthority(snapshot: OperationRunRecord): boolean {
    return snapshot.nativeRunType !== null || snapshot.nativeRunId !== null;
  }

  private async cancelAndFenceNativeAuthority(
    snapshot: OperationRunRecord,
    input: { signal: AbortSignal; reason: string },
  ): Promise<boolean> {
    const handler = this.registry.getHandler(snapshot.operationKey);
    if (!handler.cancel || !handler.fenceExternalAuthority) return false;

    const command = {
      runId: snapshot.id,
      organizationId: snapshot.organizationId,
      operationKey: snapshot.operationKey,
      reason: input.reason,
      requestedByUserId: null,
    };
    await settleWithAbort(
      handler.cancel(command),
      input.signal,
      NATIVE_FENCE_HOOK_TIMEOUT_MS,
    );
    const authority = await settleWithAbort(
      handler.fenceExternalAuthority(command),
      input.signal,
      NATIVE_FENCE_HOOK_TIMEOUT_MS,
    );
    return authority === 'fenced';
  }

  private async require(
    organizationId: string,
    runId: string,
  ): Promise<OperationRunRecord> {
    const record = await this.repository.findRunById({ organizationId, runId });
    if (!record) throw new NotFoundException('operation_run_not_found');
    return record;
  }

  private publishLifecycle(
    run: OperationRunRecord,
    status: OperationRunFinalizedEvent['status'],
  ): void {
    this.events?.emit(OPERATION_RUN_EVENTS.FINALIZED, {
      organizationId: run.organizationId,
      runId: run.id,
      status,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
    } satisfies OperationRunFinalizedEvent);
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

  private isEphemeral(record: OperationRunRecord): boolean {
    return this.registry.getDefinition(record.operationKey).successPersistence
      === 'ephemeral_on_success';
  }
}

function settleWithAbort<T>(
  work: Promise<T> | undefined,
  signal: AbortSignal,
  timeoutMs?: number,
): Promise<T | undefined> {
  signal.throwIfAborted();
  if (!work) return Promise.resolve(undefined);
  return new Promise<T>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const complete = (settle: () => void) => {
      signal.removeEventListener('abort', onAbort);
      if (timeout) clearTimeout(timeout);
      settle();
    };
    const onAbort = () => complete(() => reject(signal.reason));
    signal.addEventListener('abort', onAbort, { once: true });
    if (timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        complete(() => reject(new Error('operation_native_fence_hook_timeout')));
      }, timeoutMs);
      timeout.unref?.();
    }
    work.then(
      (value) => {
        complete(() => resolve(value));
      },
      (error: unknown) => {
        complete(() => reject(error));
      },
    );
  });
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
