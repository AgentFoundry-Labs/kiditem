import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CreateOperationRunRecord,
  OperationRunRecord,
  OperationRunRepositoryPort,
  OperationRunTransition,
  OperationScheduleRecord,
  UpsertOperationScheduleRecord,
} from '../../../application/port/out/repository/operation.repository.port';

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

export function mapOperationRunRow(row: OperationRunRow): OperationRunRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    operationKey: row.operationKey,
    definitionVersion: row.definitionVersion,
    ownerDomain: row.ownerDomain,
    title: row.title,
    engineType: row.engineType as OperationRunRecord['engineType'],
    status: row.status as OperationRunRecord['status'],
    triggerSource: row.triggerSource as OperationRunRecord['triggerSource'],
    requestedByUserId: row.requestedByUserId,
    parentRunId: row.parentRunId,
    scheduleId: row.scheduleId,
    idempotencyKey: row.idempotencyKey,
    input: requiredRecord(row.input),
    result: asRecord(row.result),
    progress: row.progress,
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
    try {
      const row = await this.prisma.operationRun.create({
        data: {
          organizationId: input.organizationId,
          operationKey: input.operationKey,
          definitionVersion: input.definitionVersion,
          ownerDomain: input.ownerDomain,
          title: input.title,
          engineType: input.engineType,
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

  async transition(
    input: OperationRunTransition,
  ): Promise<OperationRunRecord | null> {
    const data: Prisma.OperationRunUpdateManyMutationInput = {
      status: input.status,
    };
    if (input.progress !== undefined) data.progress = input.progress;
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

    const updated = await this.prisma.operationRun.updateMany({
      where: {
        id: input.runId,
        organizationId: input.organizationId,
        status: { in: [...input.expectedStatuses] },
        ...(input.expectedAttemptToken
          ? { attemptToken: input.expectedAttemptToken }
          : {}),
      },
      data,
    });
    if (updated.count === 0) return null;
    return this.findRunById({
      organizationId: input.organizationId,
      runId: input.runId,
    });
  }

  async claimNextRun(input: {
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<OperationRunRecord | null> {
    const claimed = await this.prisma.$transaction(async (transaction) => {
      // This internal queue consumer intentionally spans organizations. The
      // selected organizationId is carried into the composite-scoped update
      // and every subsequent read.
      const candidates = await transaction.$queryRaw<
        Array<{ id: string; organization_id: string }>
      >`
        SELECT id, organization_id
        FROM operation_runs
        WHERE (
          status = 'queued'
          AND attempts < max_attempts
          AND (scheduled_for IS NULL OR scheduled_for <= ${input.now})
        ) OR (
          status = 'running'
          AND attempts < max_attempts
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at <= ${input.now}
        )
        ORDER BY scheduled_for ASC NULLS FIRST, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      const candidate = candidates[0];
      if (!candidate) return null;

      const attemptToken = randomUUID();
      await transaction.operationRun.update({
        where: {
          id_organizationId: {
            id: candidate.id,
            organizationId: candidate.organization_id,
          },
        },
        data: {
          status: 'running',
          attempts: { increment: 1 },
          claimedBy: input.workerId,
          attemptToken,
          claimedAt: input.now,
          leaseExpiresAt: input.leaseExpiresAt,
          startedAt: input.now,
        },
      });
      return { runId: candidate.id, organizationId: candidate.organization_id };
    });

    if (!claimed) return null;
    return this.findRunById({
      organizationId: claimed.organizationId,
      runId: claimed.runId,
    });
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
      const candidates = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM operation_runs
        WHERE organization_id = ${input.organizationId}::uuid
          AND engine_type = 'browser'
          AND status = 'waiting_runtime'
          AND attempts < max_attempts
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      const candidate = candidates[0];
      if (!candidate) return null;

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
  }): Promise<OperationRunRecord | null> {
    const updated = await this.prisma.operationRun.updateMany({
      where: {
        id: input.runId,
        organizationId: input.organizationId,
        status: 'running',
        attemptToken: input.attemptToken,
        leaseExpiresAt: { gt: input.now },
      },
      data: {
        leaseExpiresAt: input.leaseExpiresAt,
        ...(input.progress !== undefined ? { progress: input.progress } : {}),
      },
    });
    if (updated.count === 0) return null;
    return this.findRunById({
      organizationId: input.organizationId,
      runId: input.runId,
    });
  }
}
