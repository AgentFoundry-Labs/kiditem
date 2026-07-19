import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  AiDirectJobEnvelopeSchema,
  AiDirectJobStatusSchema,
  AiDirectJobTypeSchema,
} from '../../../domain/direct-job/ai-direct-job.schema';
import type {
  AiDirectJobRecord,
  AiDirectJobRepositoryPort,
  AiDirectJobWriteScope,
  CreateAiDirectJobInput,
  FailOrRescheduleAiDirectJobInput,
} from '../../../application/port/out/repository/ai-direct-job.repository.port';

type AiDirectJobRow = Omit<AiDirectJobRecord, 'payload' | 'jobType' | 'status'> & {
  payload: unknown;
  jobType: string;
  status: string;
};

interface RawClaimedAiDirectJobRow {
  id: string;
  organization_id: string;
  job_type: string;
  source_resource_id: string;
  status: string;
  payload: unknown;
  result: unknown;
  attempts: number;
  max_attempts: number;
  scheduled_for: Date;
  claimed_at: Date | null;
  claimed_by: string | null;
  lease_expires_at: Date | null;
  finished_at: Date | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: Date;
  updated_at: Date;
  previous_status: string;
}

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

@Injectable()
export class AiDirectJobRepositoryAdapter
  implements AiDirectJobRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAiDirectJobInput): Promise<AiDirectJobRecord> {
    return this.createInScope(this.prisma, input);
  }

  async createInScope(
    scope: AiDirectJobWriteScope,
    input: CreateAiDirectJobInput,
  ): Promise<AiDirectJobRecord> {
    const payload = AiDirectJobEnvelopeSchema.parse(input.payload);
    if (payload.jobType !== input.jobType) {
      throw new Error('AI direct job payload type does not match jobType.');
    }
    const row = await scope.aiDirectJob.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        jobType: input.jobType,
        sourceResourceId: input.sourceResourceId,
        status: input.status,
        payload: payload as Prisma.InputJsonValue,
        scheduledFor: input.scheduledFor,
        maxAttempts: input.maxAttempts,
      },
    });
    return mapRecord(row as AiDirectJobRow);
  }

  async restartHeldReedit(
    input: CreateAiDirectJobInput & { jobType: 'thumbnail_reedit' },
  ): Promise<AiDirectJobRecord> {
    const payload = AiDirectJobEnvelopeSchema.parse(input.payload);
    if (payload.jobType !== 'thumbnail_reedit') {
      throw new Error('AI direct re-edit payload type does not match jobType.');
    }
    const createData = {
      id: input.id,
      organizationId: input.organizationId,
      jobType: input.jobType,
      sourceResourceId: input.sourceResourceId,
      status: input.status,
      payload: payload as Prisma.InputJsonValue,
      scheduledFor: input.scheduledFor,
      maxAttempts: input.maxAttempts,
    };
    const row = await this.prisma.aiDirectJob.upsert({
      where: {
        organizationId_jobType_sourceResourceId: {
          organizationId: input.organizationId,
          jobType: input.jobType,
          sourceResourceId: input.sourceResourceId,
        },
      },
      create: createData,
      update: {
        status: 'held',
        payload: payload as Prisma.InputJsonValue,
        result: Prisma.DbNull,
        attempts: 0,
        maxAttempts: input.maxAttempts ?? 3,
        scheduledFor: input.scheduledFor,
        claimedAt: null,
        claimedBy: null,
        leaseExpiresAt: null,
        finishedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    return mapRecord(row as AiDirectJobRow);
  }

  async release(input: {
    organizationId: string;
    jobId: string;
  }): Promise<boolean> {
    const updated = await this.prisma.aiDirectJob.updateMany({
      where: {
        id: input.jobId,
        organizationId: input.organizationId,
        status: 'held',
      },
      data: {
        status: 'pending',
        scheduledFor: new Date(),
      },
    });
    return updated.count === 1;
  }

  async claimNext(input: {
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<
    (AiDirectJobRecord & {
      claimedFromStatus: AiDirectJobRecord['status'];
    }) | null
  > {
    const rows = await this.prisma.$queryRaw<RawClaimedAiDirectJobRow[]>(
      Prisma.sql`
        WITH next_job AS (
          SELECT id, status AS previous_status
          FROM ai_direct_jobs
          WHERE attempts < max_attempts
            AND (
              (status = 'pending' AND scheduled_for <= ${input.now})
              OR (status = 'held' AND scheduled_for <= ${input.now})
              OR (
                status IN ('running', 'projecting')
                AND lease_expires_at <= ${input.now}
              )
            )
          ORDER BY scheduled_for ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE ai_direct_jobs job
        SET status = CASE
              WHEN job.result IS NULL THEN 'running'
              ELSE 'projecting'
            END,
            claimed_at = ${input.now},
            claimed_by = ${input.workerId},
            lease_expires_at = ${input.leaseExpiresAt},
            attempts = CASE
              WHEN job.result IS NULL THEN job.attempts + 1
              ELSE job.attempts
            END,
            updated_at = ${input.now}
        FROM next_job
        WHERE job.id = next_job.id
        RETURNING job.*, next_job.previous_status
      `,
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      ...mapRawRecord(row),
      claimedFromStatus: AiDirectJobStatusSchema.parse(row.previous_status),
    };
  }

  async checkpointResult(input: {
    organizationId: string;
    jobId: string;
    result: unknown;
  }): Promise<boolean> {
    const updated = await this.prisma.aiDirectJob.updateMany({
      where: {
        id: input.jobId,
        organizationId: input.organizationId,
        status: 'running',
      },
      data: {
        result: input.result as Prisma.InputJsonValue,
        status: 'projecting',
      },
    });
    return updated.count === 1;
  }

  async extendLease(input: {
    organizationId: string;
    jobId: string;
    workerId: string;
    leaseExpiresAt: Date;
  }): Promise<'running' | 'projecting' | 'cancelled' | 'lost'> {
    const current = await this.prisma.aiDirectJob.findFirst({
      where: { id: input.jobId, organizationId: input.organizationId },
      select: { status: true, claimedBy: true },
    });
    if (!current) return 'lost';
    if (current.status === 'cancelled') return 'cancelled';
    if (
      (current.status !== 'running' && current.status !== 'projecting') ||
      current.claimedBy !== input.workerId
    ) {
      return 'lost';
    }
    const updated = await this.prisma.aiDirectJob.updateMany({
      where: {
        id: input.jobId,
        organizationId: input.organizationId,
        status: current.status,
        claimedBy: input.workerId,
      },
      data: { leaseExpiresAt: input.leaseExpiresAt },
    });
    return updated.count === 1 ? current.status : 'lost';
  }

  async markSucceeded(input: {
    organizationId: string;
    jobId: string;
  }): Promise<boolean> {
    const updated = await this.prisma.aiDirectJob.updateMany({
      where: {
        id: input.jobId,
        organizationId: input.organizationId,
        status: 'projecting',
      },
      data: {
        status: 'succeeded',
        finishedAt: new Date(),
        leaseExpiresAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    return updated.count === 1;
  }

  async failOrReschedule(
    input: FailOrRescheduleAiDirectJobInput,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.aiDirectJob.findFirst({
        where: { id: input.jobId, organizationId: input.organizationId },
        select: { status: true, attempts: true, maxAttempts: true },
      });
      if (!row || TERMINAL_STATUSES.has(row.status)) return;
      const willRetry = input.retryable && row.attempts < row.maxAttempts;
      await tx.aiDirectJob.updateMany({
        where: {
          id: input.jobId,
          organizationId: input.organizationId,
          status: row.status,
        },
        data: {
          status: willRetry ? 'pending' : 'failed',
          scheduledFor: willRetry ? input.retryAt : undefined,
          finishedAt: willRetry ? null : input.now,
          claimedBy: null,
          leaseExpiresAt: null,
          lastErrorCode: input.errorCode,
          lastErrorMessage: input.errorMessage,
        },
      });
    });
  }

  async cancel(input: {
    organizationId: string;
    jobId: string;
    reason: string;
  }): Promise<AiDirectJobRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.aiDirectJob.findFirst({
        where: { id: input.jobId, organizationId: input.organizationId },
      });
      if (!existing) return null;
      if (TERMINAL_STATUSES.has(existing.status)) return mapRecord(existing);
      const updated = await tx.aiDirectJob.update({
        where: { id: existing.id },
        data: {
          status: 'cancelled',
          finishedAt: new Date(),
          leaseExpiresAt: null,
          lastErrorCode: 'user_cancelled',
          lastErrorMessage: input.reason,
        },
      });
      return mapRecord(updated);
    });
  }

  async cancelBySource(input: {
    organizationId: string;
    sourceResourceId: string;
    jobTypes: AiDirectJobRecord['jobType'][];
    reason: string;
  }): Promise<number> {
    const updated = await this.prisma.aiDirectJob.updateMany({
      where: {
        organizationId: input.organizationId,
        sourceResourceId: input.sourceResourceId,
        jobType: { in: input.jobTypes },
        status: { in: ['held', 'pending', 'running'] },
      },
      data: {
        status: 'cancelled',
        finishedAt: new Date(),
        leaseExpiresAt: null,
        lastErrorCode: 'user_cancelled',
        lastErrorMessage: input.reason,
      },
    });
    return updated.count;
  }

  async findById(input: {
    organizationId: string;
    jobId: string;
  }): Promise<AiDirectJobRecord | null> {
    const row = await this.prisma.aiDirectJob.findFirst({
      where: { id: input.jobId, organizationId: input.organizationId },
    });
    return row ? mapRecord(row) : null;
  }
}

function mapRecord(row: AiDirectJobRow): AiDirectJobRecord {
  return {
    ...row,
    jobType: AiDirectJobTypeSchema.parse(row.jobType),
    status: AiDirectJobStatusSchema.parse(row.status),
    payload: AiDirectJobEnvelopeSchema.parse(row.payload),
  };
}

function mapRawRecord(row: RawClaimedAiDirectJobRow): AiDirectJobRecord {
  return mapRecord({
    id: row.id,
    organizationId: row.organization_id,
    jobType: row.job_type,
    sourceResourceId: row.source_resource_id,
    status: row.status,
    payload: row.payload,
    result: row.result,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    scheduledFor: row.scheduled_for,
    claimedAt: row.claimed_at,
    claimedBy: row.claimed_by,
    leaseExpiresAt: row.lease_expires_at,
    finishedAt: row.finished_at,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
