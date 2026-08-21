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
export class PrismaAgentAttemptOperationTransaction implements AgentAttemptOperationTransactionPort {
  constructor(private readonly prisma: PrismaService) {}

  async startAttempt(
    input: Parameters<SessionControlPersistenceMethods['startAttempt']>[0],
  ): Promise<ExecutionAttemptRecord> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lock(tx, ['attempt', input.executionId]);
      const execution = await tx.agentExecution.findFirst({
        where: {
          id: input.executionId,
          sessionId: input.sessionId,
          organizationId: input.organizationId,
        },
        select: { id: true },
      });
      if (!execution) throw scope();
      const existing = await tx.agentExecutionAttempt.findFirst({
        where: { executionId: input.executionId, idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        if (
          existing.runtimeType !== input.runtimeType ||
          (input.externalRunId !== undefined &&
            existing.externalRunId !== input.externalRunId) ||
          (input.encryptedHandleRef !== undefined &&
            existing.encryptedHandleRef !== input.encryptedHandleRef)
        ) {
          throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
        }
        if (existing.state === 'queued') {
          return mapAttempt(await tx.agentExecutionAttempt.update({
            where: { id: existing.id },
            data: { state: 'running', startedAt: new Date() },
          }));
        }
        return mapAttempt(existing);
      }
      const latest = await tx.agentExecutionAttempt.aggregate({
        where: { executionId: input.executionId },
        _max: { attemptNumber: true },
      });
      return mapAttempt(await tx.agentExecutionAttempt.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          executionId: input.executionId,
          attemptNumber: (latest._max.attemptNumber ?? 0) + 1,
          idempotencyKey: input.idempotencyKey,
          runtimeType: input.runtimeType,
          externalRunId: input.externalRunId ?? null,
          encryptedHandleRef: input.encryptedHandleRef ?? null,
          runtimeGeneration: 0,
          state: 'running',
        },
      }));
    }).catch(rethrowStable);
  }

  async reserveAttemptForOperation(
    input: Parameters<SessionControlPersistenceMethods['reserveAttemptForOperation']>[0],
  ): Promise<ExecutionAttemptRecord> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lock(tx, ['attempt', input.executionId]);
      await lock(tx, ['attempt-operation', input.organizationId, input.operationRunId]);
      const execution = await tx.agentExecution.findFirst({
        where: {
          id: input.executionId,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          sessionTaskId: input.taskId,
          status: 'running',
        },
        select: { id: true, runtimeType: true },
      });
      if (!execution) throw scope();
      const existing = await tx.agentExecutionAttempt.findFirst({
        where: {
          executionId: input.executionId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (existing) {
        if (
          existing.organizationId !== input.organizationId ||
          existing.sessionId !== input.sessionId ||
          existing.executionId !== input.executionId ||
          existing.runtimeType !== execution.runtimeType
        ) throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
        const binding = await tx.agentExecutionAttemptOperationBinding.findFirst({
          where: {
            organizationId: input.organizationId,
            executionAttemptId: existing.id,
            operationRunId: input.operationRunId,
          },
        });
        if (!binding) throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
        return mapAttempt(existing);
      }
      const existingOperation = await tx.agentExecutionAttemptOperationBinding.findFirst({
        where: {
          organizationId: input.organizationId,
          operationRunId: input.operationRunId,
        },
        include: { attempt: true },
      });
      if (existingOperation) {
        if (
          existingOperation.attempt.executionId !== input.executionId ||
          existingOperation.attempt.sessionId !== input.sessionId
        ) throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
        return mapAttempt(existingOperation.attempt);
      }
      const latest = await tx.agentExecutionAttempt.aggregate({
        where: { executionId: input.executionId },
        _max: { attemptNumber: true },
      });
      const attempt = await tx.agentExecutionAttempt.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          executionId: input.executionId,
          attemptNumber: (latest._max.attemptNumber ?? 0) + 1,
          idempotencyKey: input.idempotencyKey,
          runtimeType: execution.runtimeType,
          state: 'queued',
        },
      });
      const operation = await tx.operationRun.findFirst({
        where: { id: input.operationRunId, organizationId: input.organizationId },
        select: { id: true },
      });
      if (!operation) throw scope();
      await tx.agentExecutionAttemptOperationBinding.create({
        data: {
          organizationId: input.organizationId,
          executionAttemptId: attempt.id,
          executionId: attempt.executionId,
          sessionId: attempt.sessionId,
          operationRunId: operation.id,
          continuationKey: `initial:${operation.id}`,
        },
      });
      return mapAttempt(attempt);
    }).catch(rethrowStable);
  }

  async findAttemptForOperation(
    input: Parameters<SessionControlPersistenceMethods['findAttemptForOperation']>[0],
  ): Promise<ExecutionAttemptRecord | null> {
    const binding = await this.prisma.agentExecutionAttemptOperationBinding.findFirst({
      where: {
        organizationId: input.organizationId,
        operationRunId: input.operationRunId,
      },
      include: { attempt: true },
    });
    return binding ? mapAttempt(binding.attempt) : null;
  }

  async activateAttemptForOperation(
    input: Parameters<SessionControlPersistenceMethods['activateAttemptForOperation']>[0],
  ): Promise<ExecutionAttemptRecord> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await lock(tx, ['attempt-operation-activate', input.organizationId, input.operationRunId]);
      const binding = await tx.agentExecutionAttemptOperationBinding.findFirst({
        where: {
          organizationId: input.organizationId,
          operationRunId: input.operationRunId,
        },
        include: { attempt: true },
      });
      if (
        !binding ||
        binding.attempt.sessionId !== input.sessionId ||
        binding.attempt.executionId !== input.executionId
      ) throw scope();
      if (binding.attempt.state === 'running') return mapAttempt(binding.attempt);
      if (binding.attempt.state !== 'queued') throw state();
      return mapAttempt(await tx.agentExecutionAttempt.update({
        where: { id: binding.attempt.id },
        data: { state: 'running', startedAt: new Date() },
      }));
    }).catch(rethrowStable);
  }

  async finishAttempt(
    input: Parameters<SessionControlPersistenceMethods['finishAttempt']>[0],
  ): Promise<ExecutionAttemptRecord> {
    const current = await this.prisma.agentExecutionAttempt.findFirst({
      where: {
        id: input.attemptId,
        executionId: input.executionId,
        sessionId: input.sessionId,
        organizationId: input.organizationId,
      },
    });
    if (!current) throw scope();
    if (current.state === input.state) return mapAttempt(current);
    if (current.state !== input.expectedState || TERMINAL_STATES.has(current.state)) throw state();
    const result = await this.prisma.agentExecutionAttempt.updateMany({
      where: { id: input.attemptId, state: input.expectedState },
      data: {
        state: input.state,
        finishedAt: new Date(),
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
      },
    });
    if (result.count !== 1) throw state();
    return mapAttempt((await this.prisma.agentExecutionAttempt.findFirst({
      where: { id: input.attemptId, organizationId: input.organizationId },
    }))!);
  }

  async persistAttemptHandle(
    input: Parameters<SessionControlPersistenceMethods['persistAttemptHandle']>[0],
  ): Promise<ExecutionAttemptRecord> {
    return this.prisma.$transaction(async (tx) => {
      await lock(tx, ['attempt-handle', input.executionId, input.attemptId]);
      const attempt = await tx.agentExecutionAttempt.findFirst({
        where: {
          id: input.attemptId,
          executionId: input.executionId,
          sessionId: input.sessionId,
          organizationId: input.organizationId,
        },
      });
      if (!attempt) throw scope();
      if (
        attempt.externalRunId === input.externalRunId &&
        attempt.encryptedHandleRef === input.encryptedHandleRef &&
        attempt.runtimeGeneration === input.runtimeGeneration &&
        attempt.runtimeType === input.runtimeType
      ) return mapAttempt(attempt);
      if (
        attempt.state !== 'running' ||
        attempt.runtimeType !== input.runtimeType ||
        attempt.externalRunId !== null ||
        attempt.encryptedHandleRef !== null
      ) throw state();
      return mapAttempt(await tx.agentExecutionAttempt.update({
        where: { id: attempt.id },
        data: {
          externalRunId: input.externalRunId,
          encryptedHandleRef: input.encryptedHandleRef,
          runtimeGeneration: input.runtimeGeneration,
        },
      }));
    }).catch(rethrowStable);
  }

  async continueOperationAttempt(
    input: Parameters<SessionControlPersistenceMethods['continueOperationAttempt']>[0],
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      input.signal.throwIfAborted();
      await lock(tx, [
        'attempt-operation-continuation',
        input.organizationId,
        input.attemptId,
        input.continuationKey,
      ]);
      const existing = await tx.agentExecutionAttemptOperationBinding.findFirst({
        where: {
          organizationId: input.organizationId,
          executionAttemptId: input.attemptId,
          continuationKey: input.continuationKey,
        },
        select: {
          executionAttemptId: true,
          operationRunId: true,
          predecessorOperationRunId: true,
        },
      });
      if (existing) {
        if (existing.predecessorOperationRunId !== input.predecessorOperationRunId) {
          throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
        }
        return {
          operationRunId: existing.operationRunId,
          attemptId: existing.executionAttemptId,
        };
      }
      const predecessor = await tx.agentExecutionAttemptOperationBinding.findFirst({
        where: {
          organizationId: input.organizationId,
          executionAttemptId: input.attemptId,
          operationRunId: input.predecessorOperationRunId,
        },
        include: {
          attempt: {
            include: {
              execution: {
                select: {
                  id: true,
                  status: true,
                  sessionTaskId: true,
                  sessionTask: { select: { status: true } },
                },
              },
            },
          },
          operationRun: true,
        },
      });
      if (!predecessor) throw scope();
      if (
        predecessor.attempt.executionId !== input.executionId ||
        predecessor.attempt.sessionId !== input.sessionId ||
        predecessor.attempt.execution.sessionTaskId !== input.taskId ||
        predecessor.attempt.state !== 'running' ||
        predecessor.attempt.execution.status !== 'running' ||
        !['running', 'waiting_approval'].includes(
          predecessor.attempt.execution.sessionTask.status,
        ) ||
        !predecessor.attempt.externalRunId ||
        !predecessor.attempt.encryptedHandleRef
      ) throw state();
      const lifecycleCancelled = predecessor.operationRun.status === 'cancelled' && [
        'operation_server_shutdown',
        'operation_server_lifecycle_expired',
      ].includes(predecessor.operationRun.errorCode ?? '');
      const approvalBoundary = predecessor.operationRun.status === 'attention_required';
      if (!lifecycleCancelled && !approvalBoundary) throw state();
      input.signal.throwIfAborted();
      const operationRun = await tx.operationRun.create({
        data: {
          organizationId: input.organizationId,
          operationKey: predecessor.operationRun.operationKey,
          definitionVersion: predecessor.operationRun.definitionVersion,
          ownerDomain: predecessor.operationRun.ownerDomain,
          title: predecessor.operationRun.title,
          engineType: predecessor.operationRun.engineType,
          resourceClass: predecessor.operationRun.resourceClass,
          executionTimeoutMs: predecessor.operationRun.executionTimeoutMs,
          triggerSource: predecessor.operationRun.triggerSource,
          requestedByUserId: predecessor.operationRun.requestedByUserId,
          parentRunId: predecessor.operationRun.parentRunId,
          scheduleId: predecessor.operationRun.scheduleId,
          idempotencyKey: `agent-session-continuation:${input.attemptId}:${input.continuationKey}`,
          input: predecessor.operationRun.input as Prisma.InputJsonValue,
          maxAttempts: predecessor.operationRun.maxAttempts,
        },
        select: { id: true },
      });
      await tx.agentExecutionAttemptOperationBinding.create({
        data: {
          organizationId: input.organizationId,
          executionAttemptId: predecessor.attempt.id,
          executionId: predecessor.attempt.executionId,
          sessionId: predecessor.attempt.sessionId,
          operationRunId: operationRun.id,
          predecessorOperationRunId: predecessor.operationRunId,
          continuationKey: input.continuationKey,
        },
      });
      await tx.operationRunCheckpoint.create({
        data: {
          organizationId: input.organizationId,
          operationRunId: operationRun.id,
          sequence: 1n,
          kind: 'runtime_handle_continuation',
          state: {
            runtimeHandle: {
              runtimeType: predecessor.attempt.runtimeType,
              executionId: predecessor.attempt.executionId,
              attemptId: predecessor.attempt.id,
              externalRunId: predecessor.attempt.externalRunId,
              encryptedHandleRef: predecessor.attempt.encryptedHandleRef,
              generation: predecessor.attempt.runtimeGeneration,
            },
          } as Prisma.InputJsonValue,
        },
      });
      return { operationRunId: operationRun.id, attemptId: predecessor.attempt.id };
    }).catch(rethrowStable);
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
