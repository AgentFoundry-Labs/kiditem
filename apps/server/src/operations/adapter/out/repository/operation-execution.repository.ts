import { randomUUID } from 'node:crypto';
import {
  MAX_OPERATION_PERSISTED_INT,
  OperationExecutionTimeoutMsSchema,
  type OperationResourceClass,
} from '@kiditem/shared/operations';
import type { PrismaService } from '../../../../prisma/prisma.service';

interface ClaimedRunIdentity {
  runId: string;
  organizationId: string;
}

function parseExecutionTimeoutMs(value: unknown): number {
  const parsed = OperationExecutionTimeoutMsSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('operation_run_persisted_execution_metadata_invalid');
  }
  return parsed.data;
}

export async function claimNextServerRun(
  prisma: PrismaService,
  input: {
    resourceClass: OperationResourceClass;
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
  },
): Promise<ClaimedRunIdentity | null> {
  return prisma.$transaction(async (transaction) => {
    // This internal queue consumer intentionally spans organizations. The
    // selected organizationId is carried into the composite-scoped update and
    // every subsequent read.
    const candidates = await transaction.$queryRaw<
      Array<{
        id: string;
        organization_id: string;
        deadline_at: Date | null;
        execution_timeout_ms: number;
      }>
    >`
      SELECT id, organization_id, deadline_at, execution_timeout_ms
      FROM operation_runs
      WHERE resource_class = ${input.resourceClass}
        AND (
          (
            status = 'queued'
            AND attempts < max_attempts
            AND (scheduled_for IS NULL OR scheduled_for <= ${input.now})
          ) OR (
            status = 'running'
            AND attempts < max_attempts
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at <= ${input.now}
          )
        )
        AND (deadline_at IS NULL OR deadline_at > ${input.now})
      ORDER BY scheduled_for ASC NULLS FIRST, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    const candidate = candidates[0];
    if (!candidate) return null;
    const executionTimeoutMs = parseExecutionTimeoutMs(
      candidate.execution_timeout_ms,
    );

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
        attemptToken: randomUUID(),
        claimedAt: input.now,
        leaseExpiresAt: input.leaseExpiresAt,
        deadlineAt:
          candidate.deadline_at ??
          new Date(input.now.getTime() + executionTimeoutMs),
        startedAt: input.now,
      },
    });
    return {
      runId: candidate.id,
      organizationId: candidate.organization_id,
    };
  });
}

export async function expireServerRunsPastDeadline(
  prisma: PrismaService,
  input: { now: Date; limit: number },
): Promise<number> {
  if (
    !Number.isInteger(input.limit) ||
    input.limit <= 0 ||
    input.limit > MAX_OPERATION_PERSISTED_INT
  ) {
    throw new Error('operation_deadline_sweep_limit_invalid');
  }

  return prisma.$transaction(async (transaction) => {
    const candidates = await transaction.$queryRaw<
      Array<{ id: string; organization_id: string }>
    >`
      SELECT id, organization_id
      FROM operation_runs
      WHERE status IN ('queued', 'waiting_runtime', 'waiting_dependency', 'running')
        AND deadline_at IS NOT NULL
        AND deadline_at <= ${input.now}
      ORDER BY deadline_at ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${input.limit}
    `;

    let expired = 0;
    for (const candidate of candidates) {
      const updated = await transaction.operationRun.updateMany({
        where: {
          id: candidate.id,
          organizationId: candidate.organization_id,
          status: {
            in: [
              'queued',
              'waiting_runtime',
              'waiting_dependency',
              'running',
            ],
          },
          deadlineAt: { lte: input.now },
        },
        data: {
          status: 'failed',
          errorCode: 'operation_deadline_exceeded',
          errorMessage: 'Operation execution deadline exceeded',
          finishedAt: input.now,
          claimedBy: null,
          attemptToken: null,
          claimedAt: null,
          leaseExpiresAt: null,
        },
      });
      expired += updated.count;
    }
    return expired;
  });
}
