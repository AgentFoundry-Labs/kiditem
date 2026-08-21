import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CanonicalResourceRefSchema, UserMessageEventPayloadSchema } from '@kiditem/shared/agent-interaction';
import { z } from 'zod';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  AgentSessionControlRepositoryError,
  type DelegatedTaskRecord,
  type DelegationContextRecord,
  type ExecutionAttemptRecord,
  type SessionApprovalRecord,
  type SessionArtifactRecord,
} from '../../../../application/port/out/repository/session-control/agent-session-control.persistence.types';
import type { AgentSessionControlQueryRepositoryPort } from '../../../../application/port/out/repository/session-control/agent-session-control-query.repository.port';
import type { AgentDelegationTransactionPort } from '../../../../application/port/out/transaction/session-control/agent-delegation.transaction.port';
import type { AgentAttemptOperationTransactionPort } from '../../../../application/port/out/transaction/session-control/agent-attempt-operation.transaction.port';
import type { AgentApprovalContinuationTransactionPort } from '../../../../application/port/out/transaction/session-control/agent-approval-continuation.transaction.port';
import type { AgentSessionTransitionTransactionPort } from '../../../../application/port/out/transaction/session-control/agent-session-transition.transaction.port';

type SessionControlPersistenceMethods = AgentSessionControlQueryRepositoryPort & AgentDelegationTransactionPort & AgentAttemptOperationTransactionPort & AgentApprovalContinuationTransactionPort & AgentSessionTransitionTransactionPort;

const TERMINAL_STATES = new Set(['archived', 'completed', 'succeeded', 'failed', 'cancelled']);

@Injectable()
export class PrismaAgentSessionControlQueryRepository implements AgentSessionControlQueryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async isExecutionCapabilityAllowed(input: {
    organizationId: string;
    sessionId: string;
    sessionTaskId: string;
    executionId: string;
    capabilityKey: string;
  }): Promise<boolean> {
    const execution = await this.prisma.agentExecution.findFirst({
      where: {
        id: input.executionId,
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        sessionTaskId: input.sessionTaskId,
        status: 'running',
        session: { lifecycle: 'active' },
        sessionTask: {
          status: { in: ['queued', 'interpreting', 'running', 'waiting_approval', 'paused'] },
        },
      },
      select: {
        agentVersionId: true,
        agentVersion: { select: { runtimeManifest: true } },
        policySnapshot: {
          select: { agentVersionId: true, capabilityKeys: true },
        },
      },
    });
    if (
      !execution ||
      execution.policySnapshot.agentVersionId !== execution.agentVersionId
    ) return false;
    const manifest = execution.agentVersion.runtimeManifest;
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return false;
    }
    const manifestKeys = stringArray(manifest.capabilityKeys);
    const policyKeys = stringArray(execution.policySnapshot.capabilityKeys);
    return (
      manifestKeys.includes(input.capabilityKey) &&
      policyKeys.includes(input.capabilityKey)
    );
  }

  async loadDelegationContext(input: {
    organizationId: string;
    sessionId: string;
    parentTaskId: string;
    parentExecutionId: string;
    targetAgentDefinitionKey: string;
  }): Promise<DelegationContextRecord | null> {
    const parent = await this.prisma.agentSessionTask.findFirst({
      where: {
        id: input.parentTaskId,
        sessionId: input.sessionId,
        organizationId: input.organizationId,
      },
      select: {
        status: true,
        assignedAgentVersionId: true,
        session: { select: { lifecycle: true } },
        assignedAgentVersion: { select: { runtimeManifest: true } },
        incomingDelegation: { select: { depth: true } },
        executions: {
          where: { id: input.parentExecutionId, status: 'running' },
          select: {
            id: true,
            policySnapshot: { select: { capabilityKeys: true } },
          },
          take: 1,
        },
        _count: { select: { children: true } },
      },
    });
    const execution = parent?.executions[0];
    if (!parent || !execution) return null;
    const target = await this.prisma.agentVersion.findFirst({
      where: {
        agentDefinitionKey: input.targetAgentDefinitionKey,
        activatedAt: { not: null },
        retiredAt: null,
      },
      select: {
        id: true,
        agentDefinitionKey: true,
        capabilityKeys: true,
      },
    });
    if (!target) return null;
    return {
      sessionLifecycle: parent.session.lifecycle,
      taskStatus: parent.status,
      parentAgentVersionId: parent.assignedAgentVersionId,
      parentExecutionId: execution.id,
      parentDepth: parent.incomingDelegation?.depth ?? 0,
      childCount: parent._count.children,
      parentManifest: parent.assignedAgentVersion.runtimeManifest,
      targetAgentVersionId: target.id,
      targetDefinitionKey: target.agentDefinitionKey,
      targetCapabilityKeys: target.capabilityKeys,
      activeTarget: true,
      parentPolicyCapabilityKeys: execution.policySnapshot.capabilityKeys,
    };
  }

  findTask(input: { organizationId: string; sessionId: string; taskId: string }) {
    return this.prisma.agentSessionTask.findFirst({
      where: { id: input.taskId, sessionId: input.sessionId, organizationId: input.organizationId },
      select: { id: true, status: true },
    });
  }

  findSession(input: { organizationId: string; sessionId: string }) {
    return this.prisma.agentSession.findFirst({
      where: { id: input.sessionId, organizationId: input.organizationId },
      select: { id: true, lifecycle: true },
    });
  }

  async loadCancelableTask(
    input: Parameters<SessionControlPersistenceMethods['loadCancelableTask']>[0],
  ) {
    const task = await this.prisma.agentSessionTask.findFirst({
      where: {
        id: input.taskId,
        sessionId: input.sessionId,
        organizationId: input.organizationId,
        status: input.expectedStatus,
        session: { createdByUserId: input.actorId },
      },
      select: {
        id: true,
        sessionId: true,
        organizationId: true,
        status: true,
        executions: {
          where: { status: 'running' },
          orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            id: true,
            runtimeType: true,
            attempts: {
              where: {
                state: { in: ['queued', 'running'] },
                operationBindings: { some: {} },
              },
              orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
              take: 1,
              select: {
                operationBindings: {
                  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                  take: 1,
                  select: { operationRunId: true },
                },
              },
            },
          },
        },
      },
    });
    const execution = task?.executions[0];
    const operationRunId = execution?.attempts[0]?.operationBindings[0]?.operationRunId ?? null;
    if (!task || !execution || !operationRunId) return null;
    return {
      organizationId: task.organizationId,
      sessionId: task.sessionId,
      taskId: task.id,
      operationRunId,
    };
  }

  async loadTaskExecution(
    input: Parameters<SessionControlPersistenceMethods['loadTaskExecution']>[0],
  ) {
    const task = await this.prisma.agentSessionTask.findFirst({
      where: {
        id: input.taskId,
        sessionId: input.sessionId,
        organizationId: input.organizationId,
        session: { createdByUserId: input.actorId },
      },
      select: {
        id: true,
        organizationId: true,
        sessionId: true,
        status: true,
        session: { select: { createdByUserId: true } },
        executions: {
          orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            id: true,
            status: true,
            runtimeType: true,
            attempts: {
              orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
              take: 1,
              select: {
                operationBindings: {
                  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                  take: 1,
                  select: { operationRunId: true },
                },
              },
            },
          },
        },
      },
    });
    const execution = task?.executions[0];
    if (!task || !execution) return null;
    return {
      organizationId: task.organizationId,
      sessionId: task.sessionId,
      taskId: task.id,
      taskStatus: task.status,
      executionId: execution.id,
      executionStatus: execution.status,
      runtimeType: execution.runtimeType,
      requestedByUserId: task.session.createdByUserId,
      operationRunId: execution.attempts[0]?.operationBindings[0]?.operationRunId ?? null,
    };
  }

  async listLifecycleRecoveryCandidates(
    input: Parameters<SessionControlPersistenceMethods['listLifecycleRecoveryCandidates']>[0],
  ) {
    // The lifecycle predicate intentionally applies *after* DISTINCT ON.  An
    // earlier cancelled envelope is not recoverable when a newer immutable
    // envelope already exists for the same stable runtime attempt.
    const organizationFilter = input.organizationId
      ? Prisma.sql`WHERE binding.organization_id = ${input.organizationId}::uuid`
      : Prisma.empty;
    const bindings = await this.prisma.$queryRaw<Array<{
      organizationId: string;
      sessionId: string;
      taskId: string;
      executionId: string;
      attemptId: string;
      predecessorOperationRunId: string;
    }>>(Prisma.sql`
      WITH latest_binding AS (
        SELECT DISTINCT ON (binding.execution_attempt_id)
          binding.organization_id,
          binding.session_id,
          binding.execution_id,
          binding.execution_attempt_id,
          binding.operation_run_id
        FROM agent_execution_attempt_operation_bindings AS binding
        ${organizationFilter}
        ORDER BY
          binding.execution_attempt_id,
          binding.created_at DESC,
          binding.id DESC
      )
      SELECT
        binding.organization_id AS "organizationId",
        binding.session_id AS "sessionId",
        execution.session_task_id AS "taskId",
        binding.execution_id AS "executionId",
        binding.execution_attempt_id AS "attemptId",
        binding.operation_run_id AS "predecessorOperationRunId"
      FROM latest_binding AS binding
      JOIN operation_runs AS operation_run
        ON operation_run.id = binding.operation_run_id
        AND operation_run.organization_id = binding.organization_id
      JOIN agent_execution_attempts AS attempt
        ON attempt.id = binding.execution_attempt_id
        AND attempt.execution_id = binding.execution_id
        AND attempt.session_id = binding.session_id
        AND attempt.organization_id = binding.organization_id
      JOIN agent_executions AS execution
        ON execution.id = binding.execution_id
        AND execution.organization_id = binding.organization_id
      JOIN agent_session_tasks AS task
        ON task.id = execution.session_task_id
        AND task.session_id = binding.session_id
        AND task.organization_id = binding.organization_id
      WHERE operation_run.status = 'cancelled'
        AND operation_run.error_code IN (
          'operation_server_shutdown',
          'operation_server_lifecycle_expired'
        )
        AND attempt.state = 'running'
        AND attempt.external_run_id IS NOT NULL
        AND attempt.encrypted_handle_ref IS NOT NULL
        AND execution.status = 'running'
        AND task.status = 'running'
      ORDER BY binding.execution_attempt_id ASC
      LIMIT ${input.limit}
    `);
    return bindings;
  }

}


function parseCanonicalUserEvent(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw state();
  const userEvent = value.userEvent;
  if (!userEvent || typeof userEvent !== 'object' || Array.isArray(userEvent)) {
    throw state();
  }
  if (
    typeof userEvent.externalEventId !== 'string' ||
    userEvent.schemaVersion !== 1
  ) throw state();
  return {
    externalEventId: userEvent.externalEventId,
    schemaVersion: 1,
    payload: UserMessageEventPayloadSchema.parse(userEvent.payload),
  };
}

function mapDelegation(
  row: { id: string; childTaskId: string; state: string },
  childExecutionId: string,
): DelegatedTaskRecord {
  return {
    delegationId: row.id,
    childTaskId: row.childTaskId,
    childExecutionId,
    state: row.state,
  };
}
function mapAttempt(row: { id: string; executionId: string; attemptNumber: number; runtimeType: string; externalRunId: string | null; encryptedHandleRef: string | null; runtimeGeneration: number; state: string }): ExecutionAttemptRecord {
  return {
    id: row.id,
    executionId: row.executionId,
    attemptNumber: row.attemptNumber,
    runtimeType: row.runtimeType,
    externalRunId: row.externalRunId,
    encryptedHandleRef: row.encryptedHandleRef,
    runtimeGeneration: row.runtimeGeneration,
    state: row.state,
  };
}
function mapApproval(row: { id: string; state: string; decisionIdempotencyKey: string | null }, changed: boolean): SessionApprovalRecord {
  return { id: row.id, state: row.state, decisionIdempotencyKey: row.decisionIdempotencyKey, changed };
}
async function ensureApprovalContinuation(
  tx: Prisma.TransactionClient,
  approval: { id: string; organizationId: string; state: string },
): Promise<void> {
  if (approval.state !== 'approved') return;
  const existing = await tx.agentSessionApprovalContinuation.findFirst({
    where: { approvalId: approval.id, organizationId: approval.organizationId },
    select: { id: true },
  });
  if (existing) return;
  await tx.agentSessionApprovalContinuation.create({
    data: {
      organizationId: approval.organizationId,
      approvalId: approval.id,
      state: 'pending',
    },
  });
}
function mapApprovalContinuation(
  approval: {
    id: string;
    attemptId: string;
    executionId: string;
    attempt: {
      runtimeType: string;
      externalRunId: string | null;
      encryptedHandleRef: string | null;
      runtimeGeneration: number;
    };
  },
  operationRunId: string,
  continuationState: 'successor_created' | 'interrupt_delivered',
) {
  if (!approval.attempt.externalRunId || !approval.attempt.encryptedHandleRef) throw state();
  return {
    approvalId: approval.id,
    operationRunId,
    attemptId: approval.attemptId,
    runtimeType: approval.attempt.runtimeType,
    executionId: approval.executionId,
    externalRunId: approval.attempt.externalRunId,
    encryptedHandleRef: approval.attempt.encryptedHandleRef,
    runtimeGeneration: approval.attempt.runtimeGeneration,
    state: continuationState,
  };
}
function mapArtifact(row: { id: string; sha256: string; lifecycle: string }): SessionArtifactRecord {
  return { id: row.id, sha256: row.sha256, lifecycle: row.lifecycle };
}

async function lock(tx: Prisma.TransactionClient, parts: string[]): Promise<void> {
  const key = parts.join(':');
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(',')}}`;
  }
  throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
}
function retryRunId(taskId: string, idempotencyKey: string): string {
  return `retry-${createHash('sha256')
    .update(canonicalJson([taskId, idempotencyKey]))
    .digest('hex')}`;
}
function toInputJson(value: Prisma.JsonValue): Prisma.InputJsonValue | Prisma.JsonNullValueInput {
  return value === null ? Prisma.JsonNull : value as Prisma.InputJsonValue;
}
function stringArray(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || !item.trim()) ||
    new Set(value).size !== value.length
  ) throw state();
  return value as string[];
}
function scope(): AgentSessionControlRepositoryError {
  return conflict('AGENT_SESSION_CONTROL_SCOPE_INVALID');
}
function state(): AgentSessionControlRepositoryError {
  return conflict('AGENT_SESSION_CONTROL_STATE_CONFLICT');
}
function conflict(code: AgentSessionControlRepositoryError['code']): AgentSessionControlRepositoryError {
  return new AgentSessionControlRepositoryError(code, code);
}
function rethrowStable(error: unknown): never {
  if (error instanceof AgentSessionControlRepositoryError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
    if (error.code === 'P2003') throw scope();
  }
  throw error;
}
