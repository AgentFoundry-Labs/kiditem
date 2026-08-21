import { OperationExecutionTimeoutMsSchema } from '@kiditem/shared/operations';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { CreateOperationRunRecord } from '../../../application/port/out/repository/operation.repository.port';
import { lockWritableAgentSession } from '../../../../agent-os/adapter/out/transaction/session-control/internal/lock-writable-agent-session';

interface ChildRunIdentity {
  runId: string;
  organizationId: string;
}

interface CompositeCancellationIdentity {
  parent: ChildRunIdentity;
  children: ChildRunIdentity[];
}

type CompositeChildInput = Omit<CreateOperationRunRecord, 'signal'>;

class ParentFenceLostError extends Error {}
class ParentOwnershipChangedError extends Error {}

export async function createFencedCompositeChild(
  prisma: PrismaService,
  input: {
    signal: AbortSignal;
    parentOrganizationId: string;
    parentRunId: string;
    expectedAttemptToken: string;
    child: CompositeChildInput;
  },
): Promise<ChildRunIdentity | null> {
  const children = await createFencedCompositeChildren(prisma, {
    signal: input.signal,
    parentOrganizationId: input.parentOrganizationId,
    parentRunId: input.parentRunId,
    expectedAttemptToken: input.expectedAttemptToken,
    children: [input.child],
  });
  return children?.[0] ?? null;
}

export async function createFencedCompositeChildren(
  prisma: PrismaService,
  input: {
    signal: AbortSignal;
    parentOrganizationId: string;
    parentRunId: string;
    expectedAttemptToken: string;
    children: CompositeChildInput[];
  },
): Promise<ChildRunIdentity[] | null> {
  input.signal.throwIfAborted();
  validateChildrenScope(input);
  const executionTimeouts = input.children.map((child) => {
    const parsed = OperationExecutionTimeoutMsSchema.safeParse(
      child.executionTimeoutMs,
    );
    if (!parsed.success) throw new Error('operation_execution_timeout_ms_invalid');
    return parsed.data;
  });

  for (let retry = 0; retry < 3; retry += 1) {
    try {
      return await prisma.$transaction(async (transaction) => {
      const discoveredOwnership =
        await transaction.agentSessionOperationRunOwnership.findFirst({
          where: {
            organizationId: input.parentOrganizationId,
            operationRunId: input.parentRunId,
          },
          select: { sessionId: true },
      });
      if (discoveredOwnership) {
        const writable = await lockWritableAgentSession(transaction, {
          organizationId: input.parentOrganizationId,
          sessionId: discoveredOwnership.sessionId,
        });
        if (writable.lifecycle !== 'active') return null;
      }
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

      const parentOwnership =
        await transaction.agentSessionOperationRunOwnership.findFirst({
          where: {
            organizationId: input.parentOrganizationId,
            operationRunId: input.parentRunId,
          },
          select: { sessionId: true },
        });
      if (
        (discoveredOwnership?.sessionId ?? null) !==
        (parentOwnership?.sessionId ?? null)
      ) {
        throw new ParentOwnershipChangedError();
      }

      const children: ChildRunIdentity[] = [];
      for (const [index, childInput] of input.children.entries()) {
        input.signal.throwIfAborted();
        const existingChild = await transaction.operationRun.findFirst({
          where: {
            organizationId: childInput.organizationId,
            operationKey: childInput.operationKey,
            idempotencyKey: childInput.idempotencyKey,
          },
          select: {
            id: true,
            organizationId: true,
            operationKey: true,
            definitionVersion: true,
            ownerDomain: true,
            title: true,
            engineType: true,
            resourceClass: true,
            executionTimeoutMs: true,
            triggerSource: true,
            requestedByUserId: true,
            parentRunId: true,
            scheduleId: true,
            idempotencyKey: true,
            input: true,
            maxAttempts: true,
            scheduledFor: true,
          },
        });
        if (existingChild && (
          existingChild.organizationId !== childInput.organizationId ||
          existingChild.operationKey !== childInput.operationKey ||
          existingChild.definitionVersion !== childInput.definitionVersion ||
          existingChild.ownerDomain !== childInput.ownerDomain ||
          existingChild.title !== childInput.title ||
          existingChild.engineType !== childInput.engineType ||
          existingChild.resourceClass !== childInput.resourceClass ||
          existingChild.executionTimeoutMs !== executionTimeouts[index] ||
          existingChild.triggerSource !== childInput.triggerSource ||
          existingChild.requestedByUserId !== childInput.requestedByUserId ||
          existingChild.parentRunId !== childInput.parentRunId ||
          existingChild.scheduleId !== childInput.scheduleId ||
          existingChild.idempotencyKey !== childInput.idempotencyKey ||
          existingChild.maxAttempts !== childInput.maxAttempts ||
          existingChild.scheduledFor?.getTime() !== childInput.scheduledFor?.getTime() ||
          !sameJson(existingChild.input, childInput.input)
        )) {
          throw new Error('operation_composite_child_scope_invalid');
        }
        if (existingChild) {
          const childOwnership =
            await transaction.agentSessionOperationRunOwnership.findFirst({
              where: {
                organizationId: input.parentOrganizationId,
                operationRunId: existingChild.id,
              },
              select: { sessionId: true },
            });
          if (
            (childOwnership?.sessionId ?? null) !==
            (parentOwnership?.sessionId ?? null)
          ) {
            throw new Error('operation_composite_child_scope_invalid');
          }
        }
        input.signal.throwIfAborted();
        const created = existingChild === null
          ? await transaction.operationRun.create({
          data: {
            organizationId: childInput.organizationId,
            operationKey: childInput.operationKey,
            definitionVersion: childInput.definitionVersion,
            ownerDomain: childInput.ownerDomain,
            title: childInput.title,
            engineType: childInput.engineType,
            resourceClass: childInput.resourceClass,
            executionTimeoutMs: executionTimeouts[index],
            triggerSource: childInput.triggerSource,
            requestedByUserId: childInput.requestedByUserId,
            parentRunId: childInput.parentRunId,
            scheduleId: childInput.scheduleId,
            idempotencyKey: childInput.idempotencyKey,
            input: childInput.input as Prisma.InputJsonValue,
            maxAttempts: childInput.maxAttempts,
            scheduledFor: childInput.scheduledFor,
          },
          select: { id: true, organizationId: true, parentRunId: true },
          })
          : null;
        if (created && parentOwnership) {
          await transaction.agentSessionOperationRunOwnership.create({
            data: {
              organizationId: input.parentOrganizationId,
              sessionId: parentOwnership.sessionId,
              operationRunId: created.id,
            },
          });
        }
        const child = existingChild ?? created;
        if (!child) throw new Error('operation_composite_child_missing');
        children.push({ runId: child.id, organizationId: child.organizationId });
      }

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

      return children;
      });
    } catch (error) {
      if (error instanceof ParentFenceLostError) return null;
      if (error instanceof ParentOwnershipChangedError && retry < 2) continue;
      if (error instanceof ParentOwnershipChangedError) {
        throw new Error('operation_composite_child_scope_invalid');
      }
      throw error;
    }
  }
  throw new Error('operation_composite_child_scope_invalid');
}

export async function cancelFencedCompositeRun(
  prisma: PrismaService,
  input: {
    signal: AbortSignal;
    organizationId: string;
    parentRunId: string;
    parentErrorCode: string | null;
    parentErrorMessage: string | null;
    childErrorCode: string;
    childErrorMessage: string;
    finishedAt: Date;
  },
): Promise<CompositeCancellationIdentity | null> {
  input.signal.throwIfAborted();
  return prisma.$transaction(async (transaction) => {
    input.signal.throwIfAborted();
    const parent = await transaction.$queryRaw<Array<ChildRunIdentity>>`
      SELECT id AS "runId", organization_id AS "organizationId"
      FROM operation_runs
      WHERE id = ${input.parentRunId}::uuid
        AND organization_id = ${input.organizationId}::uuid
        AND status IN (
          'queued',
          'waiting_runtime',
          'waiting_dependency',
          'running',
          'attention_required'
        )
      FOR UPDATE
    `;
    input.signal.throwIfAborted();
    if (parent.length !== 1) return null;

    const lockedChildren = await transaction.$queryRaw<Array<ChildRunIdentity>>`
      SELECT id AS "runId", organization_id AS "organizationId"
      FROM operation_runs
      WHERE organization_id = ${input.organizationId}::uuid
        AND parent_run_id = ${input.parentRunId}::uuid
        AND status IN (
          'queued',
          'waiting_runtime',
          'waiting_dependency',
          'running',
          'attention_required'
        )
      ORDER BY id
      FOR UPDATE
    `;
    input.signal.throwIfAborted();

    const cancelledChildren = lockedChildren.length === 0
      ? []
      : await transaction.$queryRaw<Array<ChildRunIdentity>>`
          UPDATE operation_runs
          SET status = 'cancelled',
              error_code = ${input.childErrorCode},
              error_message = ${input.childErrorMessage},
              finished_at = ${input.finishedAt},
              claimed_by = NULL,
              attempt_token = NULL,
              claimed_at = NULL,
              lease_expires_at = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE organization_id = ${input.organizationId}::uuid
            AND parent_run_id = ${input.parentRunId}::uuid
            AND id IN (${Prisma.join(lockedChildren.map((child) => Prisma.sql`${child.runId}::uuid`))})
            AND status IN (
              'queued',
              'waiting_runtime',
              'waiting_dependency',
              'running',
              'attention_required'
            )
          RETURNING id AS "runId", organization_id AS "organizationId"
        `;
    input.signal.throwIfAborted();

    const cancelledParent = await transaction.$queryRaw<Array<ChildRunIdentity>>`
      UPDATE operation_runs
      SET status = 'cancelled',
          error_code = ${input.parentErrorCode},
          error_message = ${input.parentErrorMessage},
          finished_at = ${input.finishedAt},
          claimed_by = NULL,
          attempt_token = NULL,
          claimed_at = NULL,
          lease_expires_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${input.parentRunId}::uuid
        AND organization_id = ${input.organizationId}::uuid
        AND status IN (
          'queued',
          'waiting_runtime',
          'waiting_dependency',
          'running',
          'attention_required'
        )
      RETURNING id AS "runId", organization_id AS "organizationId"
    `;
    input.signal.throwIfAborted();
    if (cancelledParent.length !== 1) throw new ParentFenceLostError();
    return { parent: cancelledParent[0], children: cancelledChildren };
  });
}

function validateChildrenScope(input: {
  parentOrganizationId: string;
  parentRunId: string;
  children: CompositeChildInput[];
}): void {
  if (input.children.length === 0 || input.children.length > 20) {
    throw new Error('operation_composite_child_scope_invalid');
  }
  const operationKeys = new Set<string>();
  const idempotencyKeys = new Set<string>();
  for (const child of input.children) {
    if (
      child.organizationId !== input.parentOrganizationId
      || child.parentRunId !== input.parentRunId
      || child.idempotencyKey === null
      || !child.idempotencyKey.trim()
      || operationKeys.has(child.operationKey)
      || idempotencyKeys.has(child.idempotencyKey)
    ) {
      throw new Error('operation_composite_child_scope_invalid');
    }
    operationKeys.add(child.operationKey);
    idempotencyKeys.add(child.idempotencyKey);
  }
}

function sameJson(left: Prisma.JsonValue, right: Record<string, unknown>): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
