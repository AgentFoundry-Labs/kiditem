import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../prisma/prisma.service';
import type {
  AgentSessionCancellationCommand,
  AgentSessionCancellationTransactionPort,
} from '../../../../application/port/out/transaction/session-control/agent-session-cancellation.transaction.port';
import { AgentSessionControlRepositoryError } from '../../../../application/port/out/repository/session-control/agent-session-control.persistence.types';
import { lockWritableAgentSession } from './internal/lock-writable-agent-session';

const options = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class PrismaAgentSessionCancellationTransaction
  implements AgentSessionCancellationTransactionPort
{
  constructor(private readonly prisma: PrismaService) {}

  async begin(input: AgentSessionCancellationCommand) {
    return this.prisma.$transaction(async (tx) => {
      const session = await lockWritableAgentSession(tx, input);
      if (session.createdByUserId !== input.actorId) throw scope();
      const task = await loadTask(tx, input);
      if (!task) throw scope();

      if (task.cancellationIdempotencyKey !== null) {
        assertExactCommand(task, input);
        if (task.cancellationResultStatus !== null) {
          return {
            kind: 'completed' as const,
            status: task.cancellationResultStatus,
          };
        }
        if (!task.cancellationOperationRunId) throw state();
        return {
          kind: 'pending' as const,
          operationRunId: task.cancellationOperationRunId,
        };
      }

      if (task.status !== input.expectedStatus) throw scope();
      const operationRunId = activeOperationRunId(task);
      if (!operationRunId) throw scope();
      const updated = await tx.agentSessionTask.updateMany({
        where: {
          id: input.taskId,
          sessionId: input.sessionId,
          organizationId: input.organizationId,
          status: input.expectedStatus,
          cancellationIdempotencyKey: null,
        },
        data: {
          cancellationIdempotencyKey: input.idempotencyKey,
          cancellationFingerprint: input.fingerprint,
          cancellationOperationRunId: operationRunId,
        },
      });
      if (updated.count !== 1) throw state();
      return { kind: 'pending' as const, operationRunId };
    }, options);
  }

  async complete(
    input: Parameters<AgentSessionCancellationTransactionPort['complete']>[0],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const session = await lockWritableAgentSession(tx, input);
      if (session.createdByUserId !== input.actorId) throw scope();
      const task = await tx.agentSessionTask.findFirst({
        where: {
          id: input.taskId,
          sessionId: input.sessionId,
          organizationId: input.organizationId,
        },
        select: cancellationSelect,
      });
      if (!task) throw scope();
      assertExactCommand(task, input);
      if (task.cancellationOperationRunId !== input.operationRunId) {
        throw conflict();
      }
      if (task.cancellationResultStatus !== null) {
        if (task.cancellationResultStatus !== input.status) throw conflict();
        return { status: task.cancellationResultStatus };
      }
      const updated = await tx.agentSessionTask.updateMany({
        where: {
          id: input.taskId,
          sessionId: input.sessionId,
          organizationId: input.organizationId,
          cancellationIdempotencyKey: input.idempotencyKey,
          cancellationFingerprint: input.fingerprint,
          cancellationOperationRunId: input.operationRunId,
          cancellationResultStatus: null,
        },
        data: { cancellationResultStatus: input.status },
      });
      if (updated.count !== 1) throw state();
      return { status: input.status };
    }, options);
  }
}

const cancellationSelect = {
  status: true,
  cancellationIdempotencyKey: true,
  cancellationFingerprint: true,
  cancellationOperationRunId: true,
  cancellationResultStatus: true,
} as const;

async function loadTask(
  tx: Prisma.TransactionClient,
  input: AgentSessionCancellationCommand,
) {
  return tx.agentSessionTask.findFirst({
    where: {
      id: input.taskId,
      sessionId: input.sessionId,
      organizationId: input.organizationId,
    },
    select: {
      ...cancellationSelect,
      executions: {
        where: { status: 'running' },
        orderBy: [{ startedAt: 'desc' as const }, { id: 'desc' as const }],
        take: 1,
        select: {
          attempts: {
            where: {
              state: { in: ['queued', 'running'] },
              operationBindings: { some: {} },
            },
            orderBy: [{ startedAt: 'desc' as const }, { id: 'desc' as const }],
            take: 1,
            select: {
              operationBindings: {
                orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
                take: 1,
                select: { operationRunId: true },
              },
            },
          },
        },
      },
    },
  });
}

function activeOperationRunId(task: Awaited<ReturnType<typeof loadTask>>): string | null {
  return task?.executions[0]?.attempts[0]?.operationBindings[0]?.operationRunId ?? null;
}

function assertExactCommand(
  task: {
    cancellationIdempotencyKey: string | null;
    cancellationFingerprint: string | null;
  },
  input: { idempotencyKey: string; fingerprint: string },
): void {
  if (
    task.cancellationIdempotencyKey !== input.idempotencyKey ||
    task.cancellationFingerprint !== input.fingerprint
  ) {
    throw conflict();
  }
}

function scope(): AgentSessionControlRepositoryError {
  return new AgentSessionControlRepositoryError(
    'AGENT_SESSION_CONTROL_SCOPE_INVALID',
    'AGENT_SESSION_CONTROL_SCOPE_INVALID',
  );
}

function conflict(): AgentSessionControlRepositoryError {
  return new AgentSessionControlRepositoryError(
    'AGENT_SESSION_CANCELLATION_IDEMPOTENCY_CONFLICT',
    'AGENT_SESSION_CANCELLATION_IDEMPOTENCY_CONFLICT',
  );
}

function state(): AgentSessionControlRepositoryError {
  return new AgentSessionControlRepositoryError(
    'AGENT_SESSION_CONTROL_STATE_CONFLICT',
    'AGENT_SESSION_CONTROL_STATE_CONFLICT',
  );
}
