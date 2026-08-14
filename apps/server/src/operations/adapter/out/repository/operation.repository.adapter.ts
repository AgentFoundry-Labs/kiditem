import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  MAX_OPERATION_PERSISTED_INT,
  OperationExecutionTimeoutMsSchema,
  OperationProgressCountSchema,
  OperationResourceClassSchema,
  OperationStageSchema,
} from '@kiditem/shared/operations';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  advanceOperationSchedulesPastLifecycleCutoff,
  cancelClaimedOperationAttemptForLifecycle,
  cancelExpiredServerWorkerAttempts,
  cancelOperationRunsForLifecycle,
  claimNextServerRun,
  expireServerRunsPastDeadline,
  readOperationLifecycleDatabaseTime,
  transitionActiveServerAttempt,
} from './operation-execution.repository';
import {
  cancelFencedCompositeRun,
  createFencedCompositeChild,
  createFencedCompositeChildren,
} from './operation-composite.repository';
import type {
  ActiveBrowserOperationAttemptRecord,
  CreateOperationRunRecord,
  OperationActiveAttemptTransition,
  OperationCompositeCancellationResult,
  OperationLifecycleBatchResult,
  OperationRunRecord,
  OperationRunRepositoryPort,
  OperationRunTransition,
  OperationScheduleRecord,
  UpsertOperationScheduleRecord,
} from '../../../application/port/out/repository/operation.repository.port';
import type { ActiveBrowserAttemptTransaction } from '../../../application/port/active-browser-attempt-transaction';

const runInclude = {
  requestedBy: {
    select: { id: true, name: true, email: true },
  },
} as const;

type OperationRunRow = Prisma.OperationRunGetPayload<{
  include: typeof runInclude;
}>;
type OperationScheduleRow = Prisma.OperationScheduleGetPayload<Record<string, never>>;

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

function requiredRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return asRecord(value) ?? {};
}

function progressCountMutation(input: {
  progressCurrent?: number | null;
  progressTotal?: number | null;
}): Prisma.OperationRunUpdateManyMutationInput {
  const hasCurrent = input.progressCurrent !== undefined;
  const hasTotal = input.progressTotal !== undefined;
  if (hasCurrent !== hasTotal) {
    throw new Error('operation_progress_counts_must_be_paired');
  }
  if (!hasCurrent) return {};

  const parsedCurrent = OperationProgressCountSchema.safeParse(
    input.progressCurrent,
  );
  const parsedTotal = OperationProgressCountSchema.safeParse(
    input.progressTotal,
  );
  if (!parsedCurrent.success || !parsedTotal.success) {
    throw new Error('operation_progress_counts_invalid');
  }

  const current = parsedCurrent.data;
  const total = parsedTotal.data;
  if ((current === null) !== (total === null)) {
    throw new Error('operation_progress_counts_must_be_paired');
  }
  if (current === null && total === null) {
    return { progressCurrent: null, progressTotal: null, progress: null };
  }
  if (
    current === null ||
    total === null ||
    current > total
  ) {
    throw new Error('operation_progress_counts_invalid');
  }
  return {
    progressCurrent: current,
    progressTotal: total,
    progress: total === 0 ? 0 : current / total,
  };
}

function invalidPersistedExecutionMetadata(): Error {
  return new Error('operation_run_persisted_execution_metadata_invalid');
}

function parsePersistedExecutionTimeoutMs(value: unknown): number {
  const parsed = OperationExecutionTimeoutMsSchema.safeParse(value);
  if (!parsed.success) throw invalidPersistedExecutionMetadata();
  return parsed.data;
}

function parsePersistedDeadlineAt(value: unknown): Date | null {
  if (value === null) return null;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw invalidPersistedExecutionMetadata();
  }
  return value;
}

function parseExecutionTimeoutMsMutation(value: unknown): number {
  const parsed = OperationExecutionTimeoutMsSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('operation_execution_timeout_ms_invalid');
  }
  return parsed.data;
}

function parsePersistedExecutionMetadata(row: OperationRunRow): {
  resourceClass: OperationRunRecord['resourceClass'];
  executionTimeoutMs: number;
  stage: OperationRunRecord['stage'];
  progressCurrent: number | null;
  progressTotal: number | null;
} {
  const resourceClass = OperationResourceClassSchema.safeParse(
    row.resourceClass,
  );
  const stage = OperationStageSchema.nullable().safeParse(row.stage);
  const progressCurrent = OperationProgressCountSchema.safeParse(
    row.progressCurrent,
  );
  const progressTotal = OperationProgressCountSchema.safeParse(
    row.progressTotal,
  );
  if (
    !resourceClass.success ||
    !stage.success ||
    !progressCurrent.success ||
    !progressTotal.success
  ) {
    throw invalidPersistedExecutionMetadata();
  }
  if (
    (progressCurrent.data === null) !== (progressTotal.data === null) ||
    (progressCurrent.data !== null &&
      progressTotal.data !== null &&
      progressCurrent.data > progressTotal.data)
  ) {
    throw invalidPersistedExecutionMetadata();
  }

  return {
    resourceClass: resourceClass.data,
    executionTimeoutMs: parsePersistedExecutionTimeoutMs(
      row.executionTimeoutMs,
    ),
    stage: stage.data,
    progressCurrent: progressCurrent.data,
    progressTotal: progressTotal.data,
  };
}

export function mapOperationRunRow(row: OperationRunRow): OperationRunRecord {
  const executionMetadata = parsePersistedExecutionMetadata(row);
  return {
    id: row.id,
    organizationId: row.organizationId,
    operationKey: row.operationKey,
    definitionVersion: row.definitionVersion,
    ownerDomain: row.ownerDomain,
    title: row.title,
    engineType: row.engineType as OperationRunRecord['engineType'],
    resourceClass: executionMetadata.resourceClass,
    executionTimeoutMs: executionMetadata.executionTimeoutMs,
    status: row.status as OperationRunRecord['status'],
    triggerSource: row.triggerSource as OperationRunRecord['triggerSource'],
    requestedByUserId: row.requestedByUserId,
    parentRunId: row.parentRunId,
    scheduleId: row.scheduleId,
    idempotencyKey: row.idempotencyKey,
    input: requiredRecord(row.input),
    result: asRecord(row.result),
    progress: row.progress,
    stage: executionMetadata.stage,
    stageUpdatedAt: row.stageUpdatedAt,
    progressCurrent: executionMetadata.progressCurrent,
    progressTotal: executionMetadata.progressTotal,
    deadlineAt: row.deadlineAt,
    nativeRunType: row.nativeRunType,
    nativeRunId: row.nativeRunId,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    claimedBy: row.claimedBy,
    attemptToken: row.attemptToken,
    claimedAt: row.claimedAt,
    leaseExpiresAt: row.leaseExpiresAt,
    scheduledFor: row.scheduledFor,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    requestedBy: row.requestedBy,
  };
}

function mapSchedule(row: OperationScheduleRow): OperationScheduleRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    operationKey: row.operationKey,
    cronExpression: row.cronExpression,
    timeZone: row.timeZone,
    misfirePolicy: row.misfirePolicy as OperationScheduleRecord['misfirePolicy'],
    input: requiredRecord(row.input),
    enabled: row.enabled,
    nextRunAt: row.nextRunAt,
    lastScheduledFor: row.lastScheduledFor,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class OperationRepositoryAdapter implements OperationRunRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async withActiveBrowserAttemptFence<T>(input: {
    organizationId: string;
    runId: string;
    expectedOperationKey: string;
    attemptToken: string;
  }, operation: (
    attempt: ActiveBrowserOperationAttemptRecord,
    transaction: ActiveBrowserAttemptTransaction,
  ) => Promise<T>): Promise<T | null> {
    return this.prisma.$transaction(async (transaction) => {
      // Organization-scoped raw lock: this Operation row is always the first
      // lock in browser publication transactions so cancellation linearizes.
      const rows = await transaction.$queryRaw<Array<{
        runId: string;
        organizationId: string;
        operationKey: string;
        engineType: string;
        status: string;
        attemptToken: string | null;
        input: Prisma.JsonValue;
        requestedByUserId: string | null;
        startedAt: Date | null;
        leaseExpiresAt: Date | null;
        deadlineAt: Date | null;
      }>>(Prisma.sql`
        SELECT
          id AS "runId",
          organization_id AS "organizationId",
          operation_key AS "operationKey",
          engine_type AS "engineType",
          status,
          attempt_token AS "attemptToken",
          input,
          requested_by_user_id AS "requestedByUserId",
          started_at AS "startedAt",
          lease_expires_at AS "leaseExpiresAt",
          deadline_at AS "deadlineAt"
        FROM operation_runs
        WHERE id = ${input.runId}::uuid
          AND organization_id = ${input.organizationId}::uuid
        FOR UPDATE
      `);
      const row = rows[0];
      if (!row) return null;

      // This clock read intentionally happens after the row lock is acquired.
      const [{ now }] = await transaction.$queryRaw<Array<{ now: Date }>>`
        SELECT clock_timestamp() AS now
        FROM operation_runs
        WHERE id = ${input.runId}::uuid
          AND organization_id = ${input.organizationId}::uuid
      `;
      if (
        !now
        || row.operationKey !== input.expectedOperationKey
        || row.engineType !== 'browser'
        || row.status !== 'running'
        || row.attemptToken !== input.attemptToken
        || !row.startedAt
        || !row.leaseExpiresAt
        || row.leaseExpiresAt.getTime() <= now.getTime()
        || !row.deadlineAt
        || row.deadlineAt.getTime() <= now.getTime()
      ) return null;

      const attempt: ActiveBrowserOperationAttemptRecord = {
        runId: row.runId,
        organizationId: row.organizationId,
        operationKey: row.operationKey,
        engineType: 'browser',
        status: 'running',
        attemptToken: row.attemptToken,
        input: requiredRecord(row.input),
        requestedByUserId: row.requestedByUserId,
        startedAt: row.startedAt,
        leaseExpiresAt: row.leaseExpiresAt,
        deadlineAt: row.deadlineAt,
      };
      return operation(
        attempt,
        transaction as unknown as ActiveBrowserAttemptTransaction,
      );
    });
  }

  async findActiveBrowserAttempt(input: {
    organizationId: string;
    runId: string;
    expectedOperationKey: string;
    attemptToken: string;
    now: Date;
  }): Promise<ActiveBrowserOperationAttemptRecord | null> {
    const row = await this.prisma.operationRun.findFirst({
      where: {
        id: input.runId,
        organizationId: input.organizationId,
        operationKey: input.expectedOperationKey,
        engineType: 'browser',
        status: 'running',
        attemptToken: input.attemptToken,
        startedAt: { not: null },
        leaseExpiresAt: { gt: input.now },
        deadlineAt: { gt: input.now },
      },
      select: {
        id: true,
        organizationId: true,
        operationKey: true,
        engineType: true,
        status: true,
        attemptToken: true,
        input: true,
        requestedByUserId: true,
        startedAt: true,
        leaseExpiresAt: true,
        deadlineAt: true,
      },
    });
    if (
      !row?.attemptToken
      || !row.startedAt
      || !row.leaseExpiresAt
      || !row.deadlineAt
    ) {
      return null;
    }
    return {
      runId: row.id,
      organizationId: row.organizationId,
      operationKey: row.operationKey,
      engineType: row.engineType as ActiveBrowserOperationAttemptRecord['engineType'],
      status: row.status as ActiveBrowserOperationAttemptRecord['status'],
      attemptToken: row.attemptToken,
      input: requiredRecord(row.input),
      requestedByUserId: row.requestedByUserId,
      startedAt: row.startedAt,
      leaseExpiresAt: row.leaseExpiresAt,
      deadlineAt: row.deadlineAt,
    };
  }

  async findRunById(input: {
    organizationId: string;
    runId: string;
  }): Promise<OperationRunRecord | null> {
    const row = await this.prisma.operationRun.findFirst({
      where: { id: input.runId, organizationId: input.organizationId },
      include: runInclude,
    });
    return row ? mapOperationRunRow(row) : null;
  }

  async findByIdempotencyKey(input: {
    organizationId: string;
    operationKey: string;
    idempotencyKey: string;
  }): Promise<OperationRunRecord | null> {
    const row = await this.prisma.operationRun.findFirst({
      where: {
        organizationId: input.organizationId,
        operationKey: input.operationKey,
        idempotencyKey: input.idempotencyKey,
      },
      include: runInclude,
    });
    return row ? mapOperationRunRow(row) : null;
  }

  async createRun(input: CreateOperationRunRecord): Promise<OperationRunRecord> {
    input.signal.throwIfAborted();
    const executionTimeoutMs = parseExecutionTimeoutMsMutation(
      input.executionTimeoutMs,
    );
    try {
      const row = await this.prisma.$transaction(async (transaction) => {
        input.signal.throwIfAborted();
        const created = await transaction.operationRun.create({
          data: {
            organizationId: input.organizationId,
            operationKey: input.operationKey,
            definitionVersion: input.definitionVersion,
            ownerDomain: input.ownerDomain,
            title: input.title,
            engineType: input.engineType,
            resourceClass: input.resourceClass,
            executionTimeoutMs,
            triggerSource: input.triggerSource,
            requestedByUserId: input.requestedByUserId,
            parentRunId: input.parentRunId,
            scheduleId: input.scheduleId,
            idempotencyKey: input.idempotencyKey,
            input: input.input as Prisma.InputJsonValue,
            maxAttempts: input.maxAttempts,
            scheduledFor: input.scheduledFor,
          },
          include: runInclude,
        });
        input.signal.throwIfAborted();
        return created;
      });
      return mapOperationRunRow(row);
    } catch (error) {
      if (
        input.idempotencyKey !== null &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.findByIdempotencyKey({
          organizationId: input.organizationId,
          operationKey: input.operationKey,
          idempotencyKey: input.idempotencyKey,
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async createChildAndWaitForDependency(input: {
    signal: AbortSignal;
    parentOrganizationId: string;
    parentRunId: string;
    expectedAttemptToken: string;
    child: Omit<CreateOperationRunRecord, 'signal'>;
  }): Promise<OperationRunRecord | null> {
    const child = await createFencedCompositeChild(this.prisma, input);
    if (!child) return null;
    return this.findRunById({
      organizationId: child.organizationId,
      runId: child.runId,
    });
  }

  async createChildrenAndWaitForDependencies(input: {
    signal: AbortSignal;
    parentOrganizationId: string;
    parentRunId: string;
    expectedAttemptToken: string;
    children: Array<Omit<CreateOperationRunRecord, 'signal'>>;
  }): Promise<OperationRunRecord[] | null> {
    const children = await createFencedCompositeChildren(this.prisma, input);
    if (!children) return null;
    const records = await Promise.all(children.map((child) => this.findRunById({
      organizationId: child.organizationId,
      runId: child.runId,
    })));
    if (records.some((record) => record === null)) {
      throw new Error('operation_composite_child_missing');
    }
    return records as OperationRunRecord[];
  }

  async cancelRunAndActiveChildren(input: {
    signal: AbortSignal;
    organizationId: string;
    parentRunId: string;
    parentErrorCode: string | null;
    parentErrorMessage: string | null;
    childErrorCode: string;
    childErrorMessage: string;
    finishedAt: Date;
  }): Promise<OperationCompositeCancellationResult | null> {
    const cancelled = await cancelFencedCompositeRun(this.prisma, input);
    if (!cancelled) return null;
    const [parent, ...children] = await Promise.all([
      this.findRunById({
        organizationId: cancelled.parent.organizationId,
        runId: cancelled.parent.runId,
      }),
      ...cancelled.children.map((child) => this.findRunById({
        organizationId: child.organizationId,
        runId: child.runId,
      })),
    ]);
    if (!parent || children.some((child) => child === null)) {
      throw new Error('operation_composite_cancellation_record_missing');
    }
    return { parent, children: children as OperationRunRecord[] };
  }

  async listRuns(input: {
    organizationId: string;
    status?: OperationRunRecord['status'];
    limit: number;
  }): Promise<OperationRunRecord[]> {
    const rows = await this.prisma.operationRun.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.status ? { status: input.status } : {}),
      },
      include: runInclude,
      orderBy: { createdAt: 'desc' },
      take: input.limit,
    });
    return rows.map(mapOperationRunRow);
  }

  async listChildRuns(input: {
    organizationId: string;
    parentRunId: string;
  }): Promise<OperationRunRecord[]> {
    const rows = await this.prisma.operationRun.findMany({
      where: { organizationId: input.organizationId, parentRunId: input.parentRunId },
      include: runInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapOperationRunRow);
  }

  async listWaitingDependencyParents(input: {
    limit: number;
  }): Promise<OperationRunRecord[]> {
    const rows = await this.prisma.operationRun.findMany({
      where: { status: 'waiting_dependency' },
      include: runInclude,
      orderBy: { updatedAt: 'asc' },
      take: input.limit,
    });
    return rows.map(mapOperationRunRow);
  }

  async transition(
    input: OperationRunTransition,
  ): Promise<OperationRunRecord | null> {
    input.signal?.throwIfAborted();
    const data: Prisma.OperationRunUpdateManyMutationInput = {
      status: input.status,
    };
    if (input.progress !== undefined) data.progress = input.progress;
    Object.assign(data, progressCountMutation(input));
    if (input.result !== undefined) {
      data.result =
        input.result === null
          ? Prisma.DbNull
          : (input.result as Prisma.InputJsonValue);
    }
    if (input.nativeRunType !== undefined) data.nativeRunType = input.nativeRunType;
    if (input.nativeRunId !== undefined) data.nativeRunId = input.nativeRunId;
    if (input.errorCode !== undefined) data.errorCode = input.errorCode;
    if (input.errorMessage !== undefined) data.errorMessage = input.errorMessage;
    if (input.startedAt !== undefined) data.startedAt = input.startedAt;
    if (input.finishedAt !== undefined) data.finishedAt = input.finishedAt;
    if (input.claimedBy !== undefined) data.claimedBy = input.claimedBy;
    if (input.attemptToken !== undefined) data.attemptToken = input.attemptToken;
    if (input.claimedAt !== undefined) data.claimedAt = input.claimedAt;
    if (input.leaseExpiresAt !== undefined) {
      data.leaseExpiresAt = input.leaseExpiresAt;
    }
    if (input.deadlineAt !== undefined) data.deadlineAt = input.deadlineAt;
    const terminalTransition = ['succeeded', 'failed', 'cancelled', 'attention_required']
      .includes(input.status);
    const mutation = {
      where: {
        id: input.runId,
        organizationId: input.organizationId,
        status: { in: [...input.expectedStatuses] },
        ...(input.expectedAttemptToken
          ? { attemptToken: input.expectedAttemptToken }
          : {}),
      },
      data,
      stage: input.stage,
      stageUpdatedAt: new Date(),
    };
    const runMutation = (transaction?: Prisma.TransactionClient) =>
      terminalTransition
        ? this.updateRunWithLockedRow(mutation, transaction)
        : this.updateRunWithStage(mutation, transaction);
    const updatedCount = input.signal
      ? await this.prisma.$transaction(async (transaction) => {
          input.signal?.throwIfAborted();
          const count = await runMutation(transaction);
          input.signal?.throwIfAborted();
          return count;
        })
      : terminalTransition
        ? await this.prisma.$transaction((transaction) => runMutation(transaction))
        : await runMutation();
    if (updatedCount === 0) return null;
    return this.findRunById({
      organizationId: input.organizationId,
      runId: input.runId,
    });
  }

  async transitionActiveAttempt(
    input: OperationActiveAttemptTransition,
  ): Promise<OperationRunRecord | null> {
    const parsedStage = input.stage === undefined
      ? undefined
      : OperationStageSchema.nullable().safeParse(input.stage);
    if (parsedStage !== undefined && !parsedStage.success) {
      throw new Error('operation_stage_invalid');
    }
    const progressCounts = progressCountMutation(input);
    const updated = await transitionActiveServerAttempt(this.prisma, {
      ...input,
      ...(parsedStage === undefined ? {} : { stage: parsedStage.data }),
      ...(progressCounts.progress === undefined
        ? {}
        : { progress: progressCounts.progress as number | null }),
      ...(progressCounts.progressCurrent === undefined
        ? {}
        : { progressCurrent: progressCounts.progressCurrent as number | null }),
      ...(progressCounts.progressTotal === undefined
        ? {}
        : { progressTotal: progressCounts.progressTotal as number | null }),
    });
    if (!updated) return null;
    return this.findRunById({
      organizationId: input.organizationId,
      runId: input.runId,
    });
  }

  async claimNextRun(input: {
    resourceClass: OperationRunRecord['resourceClass'];
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
    signal: AbortSignal;
  }): Promise<OperationRunRecord | null> {
    const claimed = await claimNextServerRun(this.prisma, input);

    if (!claimed) return null;
    return this.findRunById({
      organizationId: claimed.organizationId,
      runId: claimed.runId,
    });
  }

  readLifecycleDatabaseTime(): Promise<Date> {
    return readOperationLifecycleDatabaseTime(this.prisma);
  }

  cancelRunsForLifecycle(input: {
    cutoff: Date | null;
    errorCode:
      | 'operation_server_shutdown'
      | 'operation_server_lifecycle_expired';
    errorMessage: string;
    finishedAt: Date;
    limit: number;
    statementTimeoutMs: number;
  }): Promise<OperationLifecycleBatchResult> {
    return cancelOperationRunsForLifecycle(this.prisma, input);
  }

  advanceSchedulesPastLifecycleCutoff(input: {
    cutoff: Date;
    limit: number;
    statementTimeoutMs: number;
  }): Promise<OperationLifecycleBatchResult> {
    return advanceOperationSchedulesPastLifecycleCutoff(this.prisma, input);
  }

  cancelClaimedAttemptForLifecycle(input: {
    organizationId: string;
    runId: string;
    expectedAttemptToken: string;
    claimedBy: string;
    errorCode: 'operation_server_shutdown';
    finishedAt: Date;
  }): Promise<boolean> {
    return cancelClaimedOperationAttemptForLifecycle(this.prisma, input);
  }

  cancelExpiredWorkerAttempts(input: {
    now: Date;
    limit: number;
  }): Promise<number> {
    return cancelExpiredServerWorkerAttempts(this.prisma, input);
  }

  async heartbeatRun(input: {
    organizationId: string;
    runId: string;
    attemptToken: string;
    now: Date;
    leaseExpiresAt: Date;
    stage?: OperationRunTransition['stage'];
    progressCurrent?: number | null;
    progressTotal?: number | null;
  }): Promise<OperationRunRecord | null> {
    const updatedCount = await this.updateRunWithStage({
      where: {
        id: input.runId,
        organizationId: input.organizationId,
        status: 'running',
        attemptToken: input.attemptToken,
        leaseExpiresAt: { gt: input.now },
        deadlineAt: { gt: input.now },
      },
      data: {
        leaseExpiresAt: input.leaseExpiresAt,
        ...progressCountMutation(input),
      },
      stage: input.stage,
      stageUpdatedAt: input.now,
    });
    if (updatedCount === 0) return null;
    return this.findRunById({
      organizationId: input.organizationId,
      runId: input.runId,
    });
  }

  async expirePastDeadlineRuns(input: {
    now: Date;
    limit: number;
  }): Promise<number> {
    return expireServerRunsPastDeadline(this.prisma, input);
  }

  async listSchedules(input: {
    organizationId: string;
  }): Promise<OperationScheduleRecord[]> {
    const rows = await this.prisma.operationSchedule.findMany({
      where: { organizationId: input.organizationId },
      orderBy: { operationKey: 'asc' },
    });
    return rows.map(mapSchedule);
  }

  async findSchedule(input: {
    organizationId: string;
    operationKey: string;
  }): Promise<OperationScheduleRecord | null> {
    const row = await this.prisma.operationSchedule.findFirst({
      where: {
        organizationId: input.organizationId,
        operationKey: input.operationKey,
      },
    });
    return row ? mapSchedule(row) : null;
  }

  async upsertSchedule(
    input: UpsertOperationScheduleRecord,
  ): Promise<OperationScheduleRecord> {
    const row = await this.prisma.operationSchedule.upsert({
      where: {
        organizationId_operationKey: {
          organizationId: input.organizationId,
          operationKey: input.operationKey,
        },
      },
      create: {
        organizationId: input.organizationId,
        operationKey: input.operationKey,
        cronExpression: input.cronExpression,
        timeZone: input.timeZone,
        misfirePolicy: input.misfirePolicy,
        input: input.input as Prisma.InputJsonValue,
        enabled: input.enabled,
        nextRunAt: input.nextRunAt,
        createdByUserId: input.createdByUserId,
      },
      update: {
        cronExpression: input.cronExpression,
        timeZone: input.timeZone,
        misfirePolicy: input.misfirePolicy,
        input: input.input as Prisma.InputJsonValue,
        enabled: input.enabled,
        nextRunAt: input.nextRunAt,
        createdByUserId: input.createdByUserId,
      },
    });
    return mapSchedule(row);
  }

  async disableSchedule(input: {
    organizationId: string;
    operationKey: string;
  }): Promise<OperationScheduleRecord | null> {
    const updated = await this.prisma.operationSchedule.updateMany({
      where: {
        organizationId: input.organizationId,
        operationKey: input.operationKey,
      },
      data: { enabled: false, nextRunAt: null },
    });
    if (updated.count === 0) return null;
    return this.findSchedule(input);
  }

  async findDueSchedules(input: {
    now: Date;
    limit: number;
  }): Promise<OperationScheduleRecord[]> {
    const rows = await this.prisma.operationSchedule.findMany({
      where: { enabled: true, nextRunAt: { lte: input.now } },
      orderBy: { nextRunAt: 'asc' },
      take: input.limit,
    });
    return rows.map(mapSchedule);
  }

  async advanceDueSchedule(input: {
    organizationId: string;
    scheduleId: string;
    expectedNextRunAt: Date;
    nextRunAt: Date;
  }): Promise<boolean> {
    const updated = await this.prisma.operationSchedule.updateMany({
      where: {
        id: input.scheduleId,
        organizationId: input.organizationId,
        enabled: true,
        nextRunAt: input.expectedNextRunAt,
      },
      data: {
        lastScheduledFor: input.expectedNextRunAt,
        nextRunAt: input.nextRunAt,
      },
    });
    return updated.count === 1;
  }

  async claimNextBrowserRun(input: {
    signal: AbortSignal;
    organizationId: string;
    runtimeId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<OperationRunRecord | null> {
    input.signal.throwIfAborted();
    const claimed = await this.prisma.$transaction(async (transaction) => {
      input.signal.throwIfAborted();
      const candidates = await transaction.$queryRaw<Array<{
        id: string;
        deadline_at: Date | null;
        execution_timeout_ms: number;
      }>>`
        SELECT id, deadline_at, execution_timeout_ms
        FROM operation_runs
        WHERE organization_id = ${input.organizationId}::uuid
          AND engine_type = 'browser'
          AND status = 'waiting_runtime'
          AND attempts < max_attempts
          AND (deadline_at IS NULL OR deadline_at > ${input.now})
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      input.signal.throwIfAborted();
      const candidate = candidates[0];
      if (!candidate) return null;
      if (!Object.prototype.hasOwnProperty.call(candidate, 'deadline_at')) {
        throw invalidPersistedExecutionMetadata();
      }
      const deadlineAt = parsePersistedDeadlineAt(candidate.deadline_at);
      const executionTimeoutMs = parsePersistedExecutionTimeoutMs(
        candidate.execution_timeout_ms,
      );

      input.signal.throwIfAborted();
      await transaction.operationRun.update({
        where: {
          id_organizationId: {
            id: candidate.id,
            organizationId: input.organizationId,
          },
        },
        data: {
          status: 'running',
          attempts: { increment: 1 },
          claimedBy: input.runtimeId,
          attemptToken: randomUUID(),
          claimedAt: input.now,
          leaseExpiresAt: input.leaseExpiresAt,
          deadlineAt: deadlineAt
            ?? new Date(input.now.getTime() + executionTimeoutMs),
          startedAt: input.now,
        },
      });
      input.signal.throwIfAborted();
      return candidate.id;
    });

    if (!claimed) return null;
    return this.findRunById({ organizationId: input.organizationId, runId: claimed });
  }

  async heartbeatBrowserRun(input: {
    signal: AbortSignal;
    organizationId: string;
    runId: string;
    attemptToken: string;
    leaseDurationMs: number;
    progress?: number | null;
    stage?: OperationRunTransition['stage'];
    progressCurrent?: number | null;
    progressTotal?: number | null;
  }): Promise<OperationRunRecord | null> {
    if (input.signal.aborted) return null;
    if (
      !Number.isSafeInteger(input.leaseDurationMs) ||
      input.leaseDurationMs <= 0 ||
      input.leaseDurationMs > MAX_OPERATION_PERSISTED_INT
    ) {
      throw new Error('operation_browser_lease_duration_invalid');
    }

    const parsedStage = input.stage === undefined
      ? undefined
      : OperationStageSchema.nullable().safeParse(input.stage);
    if (parsedStage !== undefined && !parsedStage.success) {
      throw new Error('operation_stage_invalid');
    }
    const stage = parsedStage === undefined ? undefined : parsedStage.data;
    const progressCounts = progressCountMutation(input) as {
      progress?: number | null;
      progressCurrent?: number | null;
      progressTotal?: number | null;
    };
    const aborted = new Error('operation_browser_heartbeat_aborted');
    const assertNotAborted = () => {
      if (input.signal.aborted) throw aborted;
    };

    let updated = false;
    try {
      updated = await this.prisma.$transaction(async (transaction) => {
        assertNotAborted();
        const locked = await transaction.$queryRaw<
          Array<{ id: string; locked_at: Date }>
        >(
          Prisma.sql`
            WITH locked_run AS MATERIALIZED (
              SELECT id
              FROM operation_runs
              WHERE id = ${input.runId}::uuid
                AND organization_id = ${input.organizationId}::uuid
                AND status = 'running'
                AND attempt_token = ${input.attemptToken}::uuid
              FOR UPDATE
            )
            SELECT id, clock_timestamp() AS locked_at
            FROM locked_run
          `,
        );
        assertNotAborted();
        if (locked.length !== 1) return false;

        const lockedAt = locked[0]?.locked_at;
        if (!(lockedAt instanceof Date) || !Number.isFinite(lockedAt.getTime())) {
          throw new Error('operation_browser_heartbeat_clock_invalid');
        }

        const assignments: Prisma.Sql[] = [
          Prisma.sql`
            lease_expires_at = ${lockedAt}::timestamptz
              + (${input.leaseDurationMs} * interval '1 millisecond')
          `,
          Prisma.sql`updated_at = ${lockedAt}::timestamptz`,
        ];
        const progress = progressCounts.progress !== undefined
          ? progressCounts.progress
          : input.progress;
        if (progress !== undefined) {
          assignments.push(Prisma.sql`progress = ${progress}`);
        }
        if (progressCounts.progressCurrent !== undefined) {
          assignments.push(
            Prisma.sql`progress_current = ${progressCounts.progressCurrent}`,
          );
        }
        if (progressCounts.progressTotal !== undefined) {
          assignments.push(
            Prisma.sql`progress_total = ${progressCounts.progressTotal}`,
          );
        }
        if (stage !== undefined) {
          assignments.push(Prisma.sql`
            stage_updated_at = CASE
              WHEN stage IS DISTINCT FROM ${stage}
                THEN ${lockedAt}::timestamptz
              ELSE stage_updated_at
            END
          `);
          assignments.push(Prisma.sql`stage = ${stage}`);
        }

        assertNotAborted();
        const rows = await transaction.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            UPDATE operation_runs
            SET ${Prisma.join(assignments)}
            WHERE id = ${input.runId}::uuid
              AND organization_id = ${input.organizationId}::uuid
              AND status = 'running'
              AND attempt_token = ${input.attemptToken}::uuid
              AND lease_expires_at IS NOT NULL
              AND lease_expires_at > ${lockedAt}::timestamptz
              AND deadline_at IS NOT NULL
              AND deadline_at > ${lockedAt}::timestamptz
            RETURNING id
          `,
        );
        assertNotAborted();
        return rows.length === 1;
      });
    } catch (error) {
      if (error === aborted) return null;
      throw error;
    }

    if (!updated) return null;
    return this.findRunById({
      organizationId: input.organizationId,
      runId: input.runId,
    });
  }

  private async updateRunWithStage(input: {
    where: Prisma.OperationRunWhereInput;
    data: Prisma.OperationRunUpdateManyMutationInput;
    stage: OperationRunTransition['stage'];
    stageUpdatedAt: Date;
  }, client: Pick<Prisma.TransactionClient, 'operationRun'> = this.prisma): Promise<number> {
    const parsedStage = input.stage === undefined
      ? undefined
      : OperationStageSchema.nullable().safeParse(input.stage);
    if (parsedStage !== undefined && !parsedStage.success) {
      throw new Error('operation_stage_invalid');
    }
    const stage = parsedStage === undefined ? undefined : parsedStage.data;

    if (stage === undefined) {
      const updated = await client.operationRun.updateMany({
        where: input.where,
        data: input.data,
      });
      return updated.count;
    }

    const changed = await client.operationRun.updateMany({
      where: {
        ...input.where,
        ...(stage === null
          ? { stage: { not: null } }
          : { OR: [{ stage: null }, { stage: { not: stage } }] }),
      },
      data: {
        ...input.data,
        stage,
        stageUpdatedAt: input.stageUpdatedAt,
      },
    });
    if (changed.count > 0) return changed.count;

    const repeated = await client.operationRun.updateMany({
      where: { ...input.where, stage },
      data: input.data,
    });
    return repeated.count;
  }

  private async updateRunWithLockedRow(input: {
    where: Prisma.OperationRunWhereInput;
    data: Prisma.OperationRunUpdateManyMutationInput;
    stage: OperationRunTransition['stage'];
    stageUpdatedAt: Date;
  }, transaction?: Prisma.TransactionClient): Promise<number> {
    if (!transaction) {
      throw new Error('operation_terminal_transition_transaction_required');
    }
    const id = typeof input.where.id === 'string' ? input.where.id : null;
    const organizationId = typeof input.where.organizationId === 'string'
      ? input.where.organizationId
      : null;
    if (!id || !organizationId) {
      throw new Error('operation_terminal_transition_identity_required');
    }
    // Organization-scoped row-first lock shares the browser publication lock
    // order, so cancellation/report and owner publication linearize cleanly.
    await transaction.$queryRaw(Prisma.sql`
      SELECT id
      FROM operation_runs
      WHERE id = ${id}::uuid
        AND organization_id = ${organizationId}::uuid
      FOR UPDATE
    `);
    return this.updateRunWithStage(input, transaction);
  }
}
