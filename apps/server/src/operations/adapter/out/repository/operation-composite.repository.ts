import { OperationExecutionTimeoutMsSchema } from '@kiditem/shared/operations';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { CreateOperationRunRecord } from '../../../application/port/out/repository/operation.repository.port';

interface ChildRunIdentity {
  runId: string;
  organizationId: string;
}

class ParentFenceLostError extends Error {}

export async function createFencedCompositeChild(
  prisma: PrismaService,
  input: {
    signal: AbortSignal;
    parentOrganizationId: string;
    parentRunId: string;
    expectedAttemptToken: string;
    child: Omit<CreateOperationRunRecord, 'signal'>;
  },
): Promise<ChildRunIdentity | null> {
  input.signal.throwIfAborted();
  if (
    input.child.organizationId !== input.parentOrganizationId ||
    input.child.parentRunId !== input.parentRunId ||
    input.child.idempotencyKey === null
  ) {
    throw new Error('operation_composite_child_scope_invalid');
  }
  const executionTimeoutMs = OperationExecutionTimeoutMsSchema.safeParse(
    input.child.executionTimeoutMs,
  );
  if (!executionTimeoutMs.success) {
    throw new Error('operation_execution_timeout_ms_invalid');
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      input.signal.throwIfAborted();
      const fencedParent = await transaction.$queryRaw<Array<{ id: string }>>`
        WITH locked_parent AS MATERIALIZED (
          SELECT id,
                 organization_id,
                 status,
                 attempt_token,
                 lease_expires_at,
                 deadline_at
          FROM operation_runs
          WHERE id = ${input.parentRunId}::uuid
            AND organization_id = ${input.parentOrganizationId}::uuid
          FOR UPDATE
        ), fenced_parent AS MATERIALIZED (
          SELECT *, clock_timestamp() AS locked_at
          FROM locked_parent
        )
        SELECT id
        FROM fenced_parent
        WHERE status = 'running'
          AND attempt_token = ${input.expectedAttemptToken}::uuid
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at > locked_at
          AND deadline_at IS NOT NULL
          AND deadline_at > locked_at
      `;
      input.signal.throwIfAborted();
      if (fencedParent.length !== 1) return null;

      let child = await transaction.operationRun.findFirst({
        where: {
          organizationId: input.child.organizationId,
          operationKey: input.child.operationKey,
          idempotencyKey: input.child.idempotencyKey,
        },
        select: { id: true, organizationId: true },
      });
      input.signal.throwIfAborted();
      child ??= await transaction.operationRun.create({
        data: {
          organizationId: input.child.organizationId,
          operationKey: input.child.operationKey,
          definitionVersion: input.child.definitionVersion,
          ownerDomain: input.child.ownerDomain,
          title: input.child.title,
          engineType: input.child.engineType,
          resourceClass: input.child.resourceClass,
          executionTimeoutMs: executionTimeoutMs.data,
          triggerSource: input.child.triggerSource,
          requestedByUserId: input.child.requestedByUserId,
          parentRunId: input.child.parentRunId,
          scheduleId: input.child.scheduleId,
          idempotencyKey: input.child.idempotencyKey,
          input: input.child.input as Prisma.InputJsonValue,
          maxAttempts: input.child.maxAttempts,
          scheduledFor: input.child.scheduledFor,
        },
        select: { id: true, organizationId: true },
      });

      input.signal.throwIfAborted();

      const transitioned = await transaction.$queryRaw<Array<{ id: string }>>`
        UPDATE operation_runs
        SET status = 'waiting_dependency',
            claimed_by = NULL,
            attempt_token = NULL,
            claimed_at = NULL,
            lease_expires_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${input.parentRunId}::uuid
          AND organization_id = ${input.parentOrganizationId}::uuid
          AND status = 'running'
          AND attempt_token = ${input.expectedAttemptToken}::uuid
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at > clock_timestamp()
          AND deadline_at IS NOT NULL
          AND deadline_at > clock_timestamp()
        RETURNING id
      `;
      input.signal.throwIfAborted();
      if (transitioned.length !== 1) throw new ParentFenceLostError();

      return { runId: child.id, organizationId: child.organizationId };
    });
  } catch (error) {
    if (error instanceof ParentFenceLostError) return null;
    throw error;
  }
}
