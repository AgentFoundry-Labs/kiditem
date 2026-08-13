import { randomUUID } from 'node:crypto';
import {
  MAX_OPERATION_PERSISTED_INT,
  OperationExecutionTimeoutMsSchema,
  type OperationResourceClass,
} from '@kiditem/shared/operations';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type {
  OperationActiveAttemptTransition,
  OperationLifecycleBatchResult,
} from '../../../application/port/out/repository/operation.repository.port';
import { nextOccurrence } from '../../../application/service/operation-schedule-clock';

interface ClaimedRunIdentity {
  runId: string;
  organizationId: string;
}

const MAX_LIFECYCLE_BATCH_SIZE = 100;
const SHUTDOWN_ATTEMPT_ERROR_MESSAGE =
  'Operation cancelled because the API server is shutting down';
const LOST_WORKER_ERROR_MESSAGE =
  'Operation cancelled because its server worker lease expired';

function assertLifecycleBatchOptions(input: {
  limit: number;
  statementTimeoutMs: number;
}): void {
  if (
    !Number.isInteger(input.limit) ||
    input.limit <= 0 ||
    input.limit > MAX_LIFECYCLE_BATCH_SIZE ||
    !Number.isInteger(input.statementTimeoutMs) ||
    input.statementTimeoutMs <= 0 ||
    input.statementTimeoutMs > MAX_OPERATION_PERSISTED_INT
  ) {
    throw new Error('operation_lifecycle_batch_options_invalid');
  }
}

function assertSweepLimit(limit: number): void {
  if (
    !Number.isInteger(limit) ||
    limit <= 0 ||
    limit > MAX_LIFECYCLE_BATCH_SIZE
  ) {
    throw new Error('operation_worker_lost_sweep_limit_invalid');
  }
}

function readRemaining(rows: Array<{ remaining: boolean }>): boolean {
  if (rows.length !== 1 || typeof rows[0]?.remaining !== 'boolean') {
    throw new Error('operation_lifecycle_remaining_invalid');
  }
  return rows[0].remaining;
}

async function setLocalStatementTimeout(
  transaction: Prisma.TransactionClient,
  statementTimeoutMs: number,
): Promise<void> {
  await transaction.$queryRaw<Array<{ set_config: string }>>`
    -- Transaction-local setup; lifecycle batches below select id + organization_id.
    SELECT set_config('statement_timeout', ${String(statementTimeoutMs)}, true)
  `;
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
        AND status = 'queued'
        AND attempts < max_attempts
        AND (scheduled_for IS NULL OR scheduled_for <= ${input.now})
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

export async function readOperationLifecycleDatabaseTime(
  prisma: PrismaService,
): Promise<Date> {
  const rows = await prisma.$queryRaw<Array<{ database_time: Date }>>`
    -- queryraw-tenancy-exempt: database clock only
    SELECT clock_timestamp() AS database_time
  `;
  const databaseTime = rows[0]?.database_time;
  if (!(databaseTime instanceof Date) || !Number.isFinite(databaseTime.getTime())) {
    throw new Error('operation_lifecycle_database_time_invalid');
  }
  return databaseTime;
}

export async function cancelOperationRunsForLifecycle(
  prisma: PrismaService,
  input: {
    cutoff: Date | null;
    errorCode:
      | 'operation_server_shutdown'
      | 'operation_server_lifecycle_expired';
    errorMessage: string;
    finishedAt: Date;
    limit: number;
    statementTimeoutMs: number;
  },
): Promise<OperationLifecycleBatchResult> {
  assertLifecycleBatchOptions(input);
  if (
    ![
      'operation_server_shutdown',
      'operation_server_lifecycle_expired',
    ].includes(input.errorCode) ||
    typeof input.errorMessage !== 'string' ||
    input.errorMessage.length === 0
  ) {
    throw new Error('operation_lifecycle_cancellation_invalid');
  }

  return prisma.$transaction(async (transaction) => {
    await setLocalStatementTimeout(transaction, input.statementTimeoutMs);
    const candidates = input.cutoff === null
      ? await transaction.$queryRaw<Array<{
          id: string;
          organization_id: string;
        }>>`
          SELECT id, organization_id
          FROM operation_runs
          WHERE status IN ('queued', 'waiting_runtime', 'waiting_dependency', 'running')
          ORDER BY created_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${input.limit}
        `
      : await transaction.$queryRaw<Array<{
          id: string;
          organization_id: string;
        }>>`
          SELECT id, organization_id
          FROM operation_runs
          WHERE status IN ('queued', 'waiting_runtime', 'waiting_dependency', 'running')
            AND created_at <= ${input.cutoff}
          ORDER BY created_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${input.limit}
        `;

    let updated = 0;
    for (const candidate of candidates) {
      updated += input.cutoff === null
        ? await transaction.$executeRaw`
            UPDATE operation_runs
            SET status = 'cancelled',
                error_code = ${input.errorCode},
                error_message = ${input.errorMessage},
                finished_at = ${input.finishedAt},
                claimed_by = NULL,
                attempt_token = NULL,
                claimed_at = NULL,
                lease_expires_at = NULL,
                updated_at = clock_timestamp()
            WHERE id = ${candidate.id}::uuid
              AND organization_id = ${candidate.organization_id}::uuid
              AND status IN ('queued', 'waiting_runtime', 'waiting_dependency', 'running')
          `
        : await transaction.$executeRaw`
            UPDATE operation_runs
            SET status = 'cancelled',
                error_code = ${input.errorCode},
                error_message = ${input.errorMessage},
                finished_at = ${input.finishedAt},
                claimed_by = NULL,
                attempt_token = NULL,
                claimed_at = NULL,
                lease_expires_at = NULL,
                updated_at = clock_timestamp()
            WHERE id = ${candidate.id}::uuid
              AND organization_id = ${candidate.organization_id}::uuid
              AND status IN ('queued', 'waiting_runtime', 'waiting_dependency', 'running')
              AND created_at <= ${input.cutoff}
          `;
    }

    const remainingRows = input.cutoff === null
      ? await transaction.$queryRaw<Array<{ remaining: boolean }>>`
          SELECT EXISTS (
            SELECT organization_id
            FROM operation_runs
            WHERE status IN ('queued', 'waiting_runtime', 'waiting_dependency', 'running')
          ) AS remaining
        `
      : await transaction.$queryRaw<Array<{ remaining: boolean }>>`
          SELECT EXISTS (
            SELECT organization_id
            FROM operation_runs
            WHERE status IN ('queued', 'waiting_runtime', 'waiting_dependency', 'running')
              AND created_at <= ${input.cutoff}
          ) AS remaining
        `;
    return { updated, remaining: readRemaining(remainingRows) };
  });
}

export async function advanceOperationSchedulesPastLifecycleCutoff(
  prisma: PrismaService,
  input: {
    cutoff: Date;
    limit: number;
    statementTimeoutMs: number;
  },
): Promise<OperationLifecycleBatchResult> {
  assertLifecycleBatchOptions(input);

  return prisma.$transaction(async (transaction) => {
    await setLocalStatementTimeout(transaction, input.statementTimeoutMs);
    const candidates = await transaction.$queryRaw<Array<{
      id: string;
      organization_id: string;
      cron_expression: string;
      time_zone: string;
      next_run_at: Date;
    }>>`
      SELECT id, organization_id, cron_expression, time_zone, next_run_at
      FROM operation_schedules
      WHERE enabled = TRUE
        AND next_run_at IS NOT NULL
        AND next_run_at <= ${input.cutoff}
      ORDER BY next_run_at ASC, created_at ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${input.limit}
    `;

    let updated = 0;
    for (const candidate of candidates) {
      const nextRunAt = nextOccurrence(
        candidate.cron_expression,
        candidate.time_zone,
        input.cutoff,
      );
      updated += await transaction.$executeRaw`
        UPDATE operation_schedules
        SET next_run_at = ${nextRunAt},
            updated_at = clock_timestamp()
        WHERE id = ${candidate.id}::uuid
          AND organization_id = ${candidate.organization_id}::uuid
          AND enabled = TRUE
          AND next_run_at = ${candidate.next_run_at}
      `;
    }

    const remainingRows = await transaction.$queryRaw<
      Array<{ remaining: boolean }>
    >`
      SELECT EXISTS (
        SELECT organization_id
        FROM operation_schedules
        WHERE enabled = TRUE
          AND next_run_at IS NOT NULL
          AND next_run_at <= ${input.cutoff}
      ) AS remaining
    `;
    return { updated, remaining: readRemaining(remainingRows) };
  });
}

export async function cancelClaimedOperationAttemptForLifecycle(
  prisma: PrismaService,
  input: {
    organizationId: string;
    runId: string;
    expectedAttemptToken: string;
    claimedBy: string;
    errorCode: 'operation_server_shutdown';
    finishedAt: Date;
  },
): Promise<boolean> {
  const updated = await prisma.$executeRaw`
    UPDATE operation_runs
    SET status = 'cancelled',
        error_code = ${input.errorCode},
        error_message = ${SHUTDOWN_ATTEMPT_ERROR_MESSAGE},
        finished_at = ${input.finishedAt},
        claimed_by = NULL,
        attempt_token = NULL,
        claimed_at = NULL,
        lease_expires_at = NULL,
        updated_at = clock_timestamp()
    WHERE id = ${input.runId}::uuid
      AND organization_id = ${input.organizationId}::uuid
      AND status = 'running'
      AND attempt_token = ${input.expectedAttemptToken}::uuid
      AND claimed_by = ${input.claimedBy}
  `;
  return updated === 1;
}

export async function cancelExpiredServerWorkerAttempts(
  prisma: PrismaService,
  input: { now: Date; limit: number },
): Promise<number> {
  assertSweepLimit(input.limit);

  return prisma.$transaction(async (transaction) => {
    const candidates = await transaction.$queryRaw<Array<{
      id: string;
      organization_id: string;
      attempt_token: string;
      claimed_by: string;
    }>>`
      SELECT id, organization_id, attempt_token, claimed_by
      FROM operation_runs
      WHERE status = 'running'
        AND claimed_by LIKE 'operations-%'
        AND attempt_token IS NOT NULL
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at <= ${input.now}
      ORDER BY lease_expires_at ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${input.limit}
    `;

    let cancelled = 0;
    for (const candidate of candidates) {
      cancelled += await transaction.$executeRaw`
        UPDATE operation_runs
        SET status = 'cancelled',
            error_code = 'operation_worker_lost',
            error_message = ${LOST_WORKER_ERROR_MESSAGE},
            finished_at = ${input.now},
            claimed_by = NULL,
            attempt_token = NULL,
            claimed_at = NULL,
            lease_expires_at = NULL,
            updated_at = clock_timestamp()
        WHERE id = ${candidate.id}::uuid
          AND organization_id = ${candidate.organization_id}::uuid
          AND status = 'running'
          AND attempt_token = ${candidate.attempt_token}::uuid
          AND claimed_by = ${candidate.claimed_by}
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at <= ${input.now}
      `;
    }
    return cancelled;
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
