import { randomUUID } from 'node:crypto';
import {
  MAX_OPERATION_PERSISTED_INT,
  OperationExecutionTimeoutMsSchema,
  type OperationResourceClass,
} from '@kiditem/shared/operations';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { OperationActiveAttemptTransition } from '../../../application/port/out/repository/operation.repository.port';

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

function parseDeadlineAt(value: unknown): Date | null {
  if (value === null) return null;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error('operation_run_persisted_execution_metadata_invalid');
  }
  return value;
}

export async function claimNextServerRun(
  prisma: PrismaService,
  input: {
    resourceClass: OperationResourceClass;
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
    signal: AbortSignal;
  },
): Promise<ClaimedRunIdentity | null> {
  input.signal.throwIfAborted();
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
    input.signal.throwIfAborted();
    const candidate = candidates[0];
    if (!candidate) return null;
    if (!Object.prototype.hasOwnProperty.call(candidate, 'deadline_at')) {
      throw new Error('operation_run_persisted_execution_metadata_invalid');
    }
    const deadlineAt = parseDeadlineAt(candidate.deadline_at);
    const executionTimeoutMs = parseExecutionTimeoutMs(
      candidate.execution_timeout_ms,
    );

    // No awaited boundary exists between this check and issuing the mutation,
    // so shutdown observed after selection cannot claim the row.
    input.signal.throwIfAborted();
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
          deadlineAt ??
          new Date(input.now.getTime() + executionTimeoutMs),
        startedAt: input.now,
      },
    });
    // If cancellation arrived while PostgreSQL was applying the update,
    // throwing here keeps it inside this transaction's rollback boundary.
    input.signal.throwIfAborted();
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

export async function transitionActiveServerAttempt(
  prisma: PrismaService,
  input: OperationActiveAttemptTransition,
): Promise<boolean> {
  const assignments: Prisma.Sql[] = [
    Prisma.sql`status = ${input.status}`,
    Prisma.sql`updated_at = CURRENT_TIMESTAMP`,
  ];
  const add = (column: Prisma.Sql, value: unknown) => {
    assignments.push(Prisma.sql`${column} = ${value}`);
  };
  if (input.progress !== undefined) add(Prisma.sql`progress`, input.progress);
  if (input.stage !== undefined) {
    assignments.push(Prisma.sql`
      stage_updated_at = CASE
        WHEN stage IS DISTINCT FROM ${input.stage}
          THEN clock_timestamp()
        ELSE stage_updated_at
      END
    `);
    add(Prisma.sql`stage`, input.stage);
  }
  if (input.progressCurrent !== undefined) {
    add(Prisma.sql`progress_current`, input.progressCurrent);
  }
  if (input.progressTotal !== undefined) {
    add(Prisma.sql`progress_total`, input.progressTotal);
  }
  if (input.result !== undefined) {
    assignments.push(
      Prisma.sql`result = ${input.result === null ? null : JSON.stringify(input.result)}::jsonb`,
    );
  }
  if (input.nativeRunType !== undefined) {
    add(Prisma.sql`native_run_type`, input.nativeRunType);
  }
  if (input.nativeRunId !== undefined) add(Prisma.sql`native_run_id`, input.nativeRunId);
  if (input.errorCode !== undefined) add(Prisma.sql`error_code`, input.errorCode);
  if (input.errorMessage !== undefined) add(Prisma.sql`error_message`, input.errorMessage);
  if (input.finishedAt !== undefined) add(Prisma.sql`finished_at`, input.finishedAt);
  if (input.claimedBy !== undefined) add(Prisma.sql`claimed_by`, input.claimedBy);
  if (input.attemptToken !== undefined) {
    assignments.push(Prisma.sql`attempt_token = ${input.attemptToken}::uuid`);
  }
  if (input.claimedAt !== undefined) add(Prisma.sql`claimed_at`, input.claimedAt);
  if (input.leaseExpiresAt !== undefined) {
    add(Prisma.sql`lease_expires_at`, input.leaseExpiresAt);
  }

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH locked_attempt AS MATERIALIZED (
      SELECT id, organization_id
      FROM operation_runs
      WHERE id = ${input.runId}::uuid
        AND organization_id = ${input.organizationId}::uuid
      FOR UPDATE
    ), fenced_attempt AS MATERIALIZED (
      SELECT id, organization_id, clock_timestamp() AS locked_at
      FROM locked_attempt
    )
    UPDATE operation_runs AS run
    SET ${Prisma.join(assignments)}
    FROM fenced_attempt
    WHERE run.id = fenced_attempt.id
      AND run.organization_id = fenced_attempt.organization_id
      AND run.status IN (${Prisma.join(input.expectedStatuses)})
      AND run.attempt_token = ${input.expectedAttemptToken}::uuid
      AND run.lease_expires_at IS NOT NULL
      AND run.lease_expires_at > fenced_attempt.locked_at
      AND run.deadline_at IS NOT NULL
      AND run.deadline_at > fenced_attempt.locked_at
    RETURNING run.id
  `;
  return rows.length === 1;
}
