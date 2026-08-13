import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  OperationExecutionTimeoutMsSchema,
  OperationProgressCountSchema,
  OperationResourceClassSchema,
  OperationStageSchema,
} from '@kiditem/shared/operations';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CreateOperationRunRecord,
  OperationActiveAttemptTransition,
  OperationLifecycleBatchResult,
  OperationRunRecord,
  OperationRunRepositoryPort,
  OperationRunTransition,
  OperationScheduleRecord,
  UpsertOperationScheduleRecord,
} from '../../../application/port/out/repository/operation.repository.port';
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
import { createFencedCompositeChild } from './operation-composite.repository';

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
    const executionTimeoutMs = parseExecutionTimeoutMsMutation(
      input.executionTimeoutMs,
    );
    try {
      const row = await this.prisma.operationRun.create({
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
    parentOrganizationId: string;
    parentRunId: string;
    expectedAttemptToken: string;
    child: CreateOperationRunRecord;
  }): Promise<OperationRunRecord | null> {
    const child = await createFencedCompositeChild(this.prisma, input);
    if (!child) return null;
    return this.findRunById({
      organizationId: child.organizationId,
      runId: child.runId,
    });
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
    if (input.attemptDelta !== undefined) {
      data.attempts = { increment: input.attemptDelta };
    }

    const updatedCount = await this.updateRunWithStage({
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
    });
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
    organizationId: string;
    runtimeId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<OperationRunRecord | null> {
    const claimed = await this.prisma.$transaction(async (transaction) => {
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
      const candidate = candidates[0];
      if (!candidate) return null;
      if (!Object.prototype.hasOwnProperty.call(candidate, 'deadline_at')) {
        throw invalidPersistedExecutionMetadata();
      }
      const deadlineAt = parsePersistedDeadlineAt(candidate.deadline_at);
      const executionTimeoutMs = parsePersistedExecutionTimeoutMs(
        candidate.execution_timeout_ms,
      );

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
      return candidate.id;
    });

    if (!claimed) return null;
    return this.findRunById({ organizationId: input.organizationId, runId: claimed });
  }

  async heartbeatBrowserRun(input: {
    organizationId: string;
    runId: string;
    attemptToken: string;
    now: Date;
    leaseExpiresAt: Date;
    progress?: number | null;
    stage?: OperationRunTransition['stage'];
    progressCurrent?: number | null;
    progressTotal?: number | null;
  }): Promise<OperationRunRecord | null> {
    const data: Prisma.OperationRunUpdateManyMutationInput = {
      leaseExpiresAt: input.leaseExpiresAt,
      ...(input.progress !== undefined ? { progress: input.progress } : {}),
      ...progressCountMutation(input),
    };
    const updatedCount = await this.updateRunWithStage({
      where: {
        id: input.runId,
        organizationId: input.organizationId,
        status: 'running',
        attemptToken: input.attemptToken,
        leaseExpiresAt: { gt: input.now },
        deadlineAt: { gt: input.now },
      },
      data,
      stage: input.stage,
      stageUpdatedAt: input.now,
    });
    if (updatedCount === 0) return null;
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
  }): Promise<number> {
    const parsedStage = input.stage === undefined
      ? undefined
      : OperationStageSchema.nullable().safeParse(input.stage);
    if (parsedStage !== undefined && !parsedStage.success) {
      throw new Error('operation_stage_invalid');
    }
    const stage = parsedStage === undefined ? undefined : parsedStage.data;

    if (stage === undefined) {
      const updated = await this.prisma.operationRun.updateMany({
        where: input.where,
        data: input.data,
      });
      return updated.count;
    }

    const changed = await this.prisma.operationRun.updateMany({
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

    const repeated = await this.prisma.operationRun.updateMany({
      where: { ...input.where, stage },
      data: input.data,
    });
    return repeated.count;
  }
}
