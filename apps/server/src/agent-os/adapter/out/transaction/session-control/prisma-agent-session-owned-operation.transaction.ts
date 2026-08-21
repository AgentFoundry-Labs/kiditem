import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  AgentSessionControlRepositoryError,
} from '../../../../application/port/out/repository/session-control/agent-session-control.persistence.types';
import type { AgentSessionOperationDefinitionSnapshot } from '../../../../application/port/out/operation/agent-session-operation-platform.port';
import type { AgentSessionOwnedOperationTransactionPort } from '../../../../application/port/out/transaction/session-control/agent-session-owned-operation.transaction.port';
import { lockWritableAgentSession } from './internal/lock-writable-agent-session';

@Injectable()
export class PrismaAgentSessionOwnedOperationTransaction
  implements AgentSessionOwnedOperationTransactionPort
{
  constructor(private readonly prisma: PrismaService) {}

  async createExecutionRun(
    input: Parameters<AgentSessionOwnedOperationTransactionPort['createExecutionRun']>[0],
  ): Promise<{ operationRunId: string; attemptId: string }> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      input.signal.throwIfAborted();
      await lockActiveSession(tx, input);
      const existing = await findIdempotentRun(tx, input);
      if (existing) {
        const attemptId = exactExecutionReplay(existing, input);
        return { operationRunId: existing.id, attemptId };
      }

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

      const operation = await createOwnedOperationRun(tx, input);
      await tx.agentSessionOperationRunOwnership.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          operationRunId: operation.id,
        },
      });
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
          idempotencyKey: `operation:${operation.id}`,
          runtimeType: execution.runtimeType,
          state: 'queued',
        },
        select: { id: true },
      });
      await tx.agentExecutionAttemptOperationBinding.create({
        data: {
          organizationId: input.organizationId,
          executionAttemptId: attempt.id,
          executionId: input.executionId,
          sessionId: input.sessionId,
          operationRunId: operation.id,
          continuationKey: `initial:${operation.id}`,
        },
      });
      input.signal.throwIfAborted();
      return { operationRunId: operation.id, attemptId: attempt.id };
    }).catch(rethrowStable);
  }

  async createCapabilityRun(
    input: Parameters<AgentSessionOwnedOperationTransactionPort['createCapabilityRun']>[0],
  ): Promise<{ operationRunId: string }> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      input.signal.throwIfAborted();
      await lockActiveSession(tx, input);
      const existing = await findIdempotentRun(tx, input);
      if (existing) {
        exactCapabilityReplay(existing, input);
        return { operationRunId: existing.id };
      }
      const operation = await createOwnedOperationRun(tx, input);
      await tx.agentSessionOperationRunOwnership.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          operationRunId: operation.id,
        },
      });
      input.signal.throwIfAborted();
      return { operationRunId: operation.id };
    }).catch(rethrowStable);
  }
}

type OperationInput = {
  organizationId: string;
  sessionId: string;
  requestedByUserId: string | null;
  idempotencyKey: string;
  definition: AgentSessionOperationDefinitionSnapshot;
  parsedInput: Record<string, unknown>;
};

async function lockActiveSession(
  tx: Prisma.TransactionClient,
  input: Pick<OperationInput, 'organizationId' | 'sessionId'>,
): Promise<void> {
  const session = await lockWritableAgentSession(tx, input);
  if (session.lifecycle !== 'active') throw state();
}

async function findIdempotentRun(
  tx: Prisma.TransactionClient,
  input: OperationInput,
) {
  return tx.operationRun.findFirst({
    where: {
      organizationId: input.organizationId,
      operationKey: input.definition.key,
      idempotencyKey: input.idempotencyKey,
    },
    include: {
      agentSessionOperationRunOwnership: true,
      agentExecutionAttemptBinding: {
        include: {
          attempt: {
            select: {
              id: true,
              executionId: true,
              sessionId: true,
            },
          },
        },
      },
    },
  });
}

function exactCapabilityReplay(
  existing: Awaited<ReturnType<typeof findIdempotentRun>>,
  input: OperationInput,
): void {
  if (!existing || !sameOperation(existing, input) || existing.agentExecutionAttemptBinding) {
    throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
  }
}

function exactExecutionReplay(
  existing: NonNullable<Awaited<ReturnType<typeof findIdempotentRun>>>,
  input: OperationInput & { taskId: string; executionId: string },
): string {
  if (!sameOperation(existing, input)) {
    throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
  }
  const binding = existing.agentExecutionAttemptBinding;
  if (
    !binding
    || binding.predecessorOperationRunId !== null
    || binding.continuationKey !== `initial:${existing.id}`
    || binding.executionId !== input.executionId
    || binding.sessionId !== input.sessionId
    || binding.attempt.executionId !== input.executionId
    || binding.attempt.sessionId !== input.sessionId
  ) {
    throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
  }
  return binding.executionAttemptId;
}

function sameOperation(
  existing: NonNullable<Awaited<ReturnType<typeof findIdempotentRun>>>,
  input: OperationInput,
): boolean {
  const owner = existing.agentSessionOperationRunOwnership;
  return owner?.organizationId === input.organizationId
    && owner.sessionId === input.sessionId
    && existing.definitionVersion === input.definition.version
    && existing.ownerDomain === input.definition.ownerDomain
    && existing.title === input.definition.title
    && existing.engineType === input.definition.engineType
    && existing.resourceClass === input.definition.resourceClass
    && existing.executionTimeoutMs === input.definition.executionTimeoutMs
    && existing.triggerSource === 'agent'
    && existing.requestedByUserId === input.requestedByUserId
    && existing.parentRunId === null
    && existing.scheduleId === null
    && existing.maxAttempts === input.definition.maxAttempts
    && existing.scheduledFor === null
    && sameJson(existing.input, input.parsedInput);
}

async function createOwnedOperationRun(
  tx: Prisma.TransactionClient,
  input: OperationInput,
) {
  return tx.operationRun.create({
    data: {
      organizationId: input.organizationId,
      operationKey: input.definition.key,
      definitionVersion: input.definition.version,
      ownerDomain: input.definition.ownerDomain,
      title: input.definition.title,
      engineType: input.definition.engineType,
      resourceClass: input.definition.resourceClass,
      executionTimeoutMs: input.definition.executionTimeoutMs,
      triggerSource: 'agent',
      requestedByUserId: input.requestedByUserId,
      idempotencyKey: input.idempotencyKey,
      input: input.parsedInput as Prisma.InputJsonValue,
      maxAttempts: input.definition.maxAttempts,
    },
    select: { id: true },
  });
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

function scope(): AgentSessionControlRepositoryError {
  return conflict('AGENT_SESSION_CONTROL_SCOPE_INVALID');
}

function state(): AgentSessionControlRepositoryError {
  return conflict('AGENT_SESSION_CONTROL_STATE_CONFLICT');
}

function conflict(
  code: AgentSessionControlRepositoryError['code'],
): AgentSessionControlRepositoryError {
  return new AgentSessionControlRepositoryError(code, code);
}

function rethrowStable(error: unknown): never {
  if (error instanceof AgentSessionControlRepositoryError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      throw conflict('AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT');
    }
    if (error.code === 'P2003') throw scope();
  }
  throw error;
}
