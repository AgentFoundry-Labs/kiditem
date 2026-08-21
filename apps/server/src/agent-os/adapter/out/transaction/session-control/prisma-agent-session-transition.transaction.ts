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
export class PrismaAgentSessionTransitionTransaction implements AgentSessionTransitionTransactionPort {
  constructor(private readonly prisma: PrismaService) {}

  async appendArtifact(
    input: Parameters<SessionControlPersistenceMethods['appendArtifact']>[0],
  ): Promise<SessionArtifactRecord> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lock(tx, ['artifact', input.executionId, input.idempotencyKey]);
      const execution = await tx.agentExecution.findFirst({
        where: {
          id: input.executionId,
          sessionId: input.sessionId,
          sessionTaskId: input.taskId,
          organizationId: input.organizationId,
        },
      });
      if (!execution) throw scope();
      const existing = await tx.agentSessionArtifact.findFirst({
        where: { executionId: input.executionId, idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (
          existing.organizationId !== input.organizationId ||
          existing.sessionId !== input.sessionId ||
          existing.taskId !== input.taskId ||
          existing.artifactType !== input.artifactType ||
          existing.storageReference !== input.storageReference ||
          existing.sha256 !== input.sha256 ||
          !canonicalEqual(existing.metadata, input.metadata)
        ) throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
        return mapArtifact(existing);
      }
      return mapArtifact(await tx.agentSessionArtifact.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          taskId: input.taskId,
          executionId: input.executionId,
          artifactType: input.artifactType,
          storageReference: input.storageReference,
          sha256: input.sha256,
          metadata: input.metadata as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        },
      }));
    }).catch(rethrowStable);
  }

  async transitionTask(
    input: Parameters<SessionControlPersistenceMethods['transitionTask']>[0],
  ): Promise<{ id: string; status: string }> {
    if (TERMINAL_STATES.has(input.expectedState) && input.expectedState !== input.state) throw state();
    const result = await this.prisma.agentSessionTask.updateMany({
      where: {
        id: input.taskId,
        sessionId: input.sessionId,
        organizationId: input.organizationId,
        status: input.expectedState,
      },
      data: {
        status: input.state,
        finishedAt: TERMINAL_STATES.has(input.state) ? new Date() : null,
      },
    });
    if (result.count !== 1) await this.throwScopeOrStateForTask(input);
    return (await this.findTask(input))!;
  }

  async transitionSession(
    input: Parameters<SessionControlPersistenceMethods['transitionSession']>[0],
  ): Promise<{ id: string; lifecycle: string }> {
    if (TERMINAL_STATES.has(input.expectedState) && input.expectedState !== input.state) throw state();
    const terminalAt = TERMINAL_STATES.has(input.state) ? new Date() : null;
    const result = await this.prisma.agentSession.updateMany({
      where: {
        id: input.sessionId,
        organizationId: input.organizationId,
        lifecycle: input.expectedState,
      },
      data: {
        lifecycle: input.state,
        completedAt: input.state === 'completed' ? terminalAt : undefined,
        cancelledAt: input.state === 'cancelled' ? terminalAt : undefined,
        archivedAt: input.state === 'archived' ? terminalAt : undefined,
      },
    });
    if (result.count !== 1) {
      if (!(await this.findSession(input))) throw scope();
      throw state();
    }
    return (await this.findSession(input))!;
  }

  async createRetryExecution(
    input: Parameters<SessionControlPersistenceMethods['createRetryExecution']>[0],
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lock(tx, ['retry-task', input.organizationId, input.sessionId, input.taskId]);
      const task = await tx.agentSessionTask.findFirst({
        where: {
          id: input.taskId,
          sessionId: input.sessionId,
          organizationId: input.organizationId,
          session: { createdByUserId: input.actorId, lifecycle: 'active' },
        },
        select: {
          id: true,
          organizationId: true,
          sessionId: true,
          status: true,
          session: { select: { createdByUserId: true, copilotThreadId: true } },
          executions: {
            orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: {
              id: true,
              agentVersionId: true,
              runtimeType: true,
              modelIdentity: true,
              policySnapshotId: true,
              inputHash: true,
              currentInput: true,
              resourceRefs: true,
              attempt: true,
            },
          },
        },
      });
      if (!task) {
        throw scope();
      }
      const aguiRunId = retryRunId(input.taskId, input.idempotencyKey);
      const existing = await tx.agentExecution.findFirst({
        where: {
          organizationId: input.organizationId,
          copilotThreadId: task.session.copilotThreadId,
          aguiRunId,
        },
        select: {
          id: true,
          status: true,
          runtimeType: true,
          attempts: {
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
      });
      if (existing) {
        return {
          organizationId: task.organizationId,
          sessionId: task.sessionId,
          taskId: task.id,
          taskStatus: task.status,
          executionId: existing.id,
          executionStatus: existing.status,
          runtimeType: existing.runtimeType,
          requestedByUserId: task.session.createdByUserId,
          operationRunId: existing.attempts[0]?.operationBindings[0]?.operationRunId ?? null,
        };
      }
      if (task.status !== input.expectedStatus) throw state();
      const previous = task.executions[0];
      if (!previous) throw state();
      const execution = await tx.agentExecution.create({
        data: {
          organizationId: task.organizationId,
          sessionId: task.sessionId,
          sessionTaskId: task.id,
          copilotThreadId: task.session.copilotThreadId,
          aguiRunId,
          agentVersionId: previous.agentVersionId,
          runtimeType: previous.runtimeType,
          modelIdentity: previous.modelIdentity,
          policySnapshotId: previous.policySnapshotId,
          inputHash: previous.inputHash,
          currentInput: toInputJson(previous.currentInput),
          resourceRefs: toInputJson(previous.resourceRefs),
          attempt: previous.attempt + 1,
          status: 'running',
        },
        select: { id: true, status: true, runtimeType: true },
      });
      await tx.agentSessionTask.update({
        where: { id: task.id },
        data: { status: 'queued', finishedAt: null },
      });
      return {
        organizationId: task.organizationId,
        sessionId: task.sessionId,
        taskId: task.id,
        taskStatus: 'queued',
        executionId: execution.id,
        executionStatus: execution.status,
        runtimeType: execution.runtimeType,
        requestedByUserId: task.session.createdByUserId,
        operationRunId: null,
      };
    }).catch(rethrowStable);
  }

  private findTask(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
  }) {
    return this.prisma.agentSessionTask.findFirst({
      where: { id: input.taskId, sessionId: input.sessionId, organizationId: input.organizationId },
      select: { id: true, status: true },
    });
  }

  private findSession(input: { organizationId: string; sessionId: string }) {
    return this.prisma.agentSession.findFirst({
      where: { id: input.sessionId, organizationId: input.organizationId },
      select: { id: true, lifecycle: true },
    });
  }

  private async throwScopeOrStateForTask(input: {
    organizationId: string;
    sessionId: string;
    taskId: string;
  }): Promise<never> {
    if (!(await this.findTask(input))) throw scope();
    throw state();
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
