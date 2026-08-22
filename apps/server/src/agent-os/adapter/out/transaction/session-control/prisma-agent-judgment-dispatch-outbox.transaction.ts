import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { AgentOsBoundaryError } from '../../../../domain/agent-os.errors';
import type { AgentJudgmentDispatchOutboxTransactionPort } from '../../../../application/port/out/transaction/session-control/agent-judgment-dispatch-outbox.transaction.port';

const LEASE_MS = 30_000;

/** PostgreSQL ownership/lease boundary for a single durable judgment handoff. */
@Injectable()
export class PrismaAgentJudgmentDispatchOutboxTransaction
  implements AgentJudgmentDispatchOutboxTransactionPort
{
  constructor(private readonly prisma: PrismaService) {}

  async listPending(
    input: Parameters<AgentJudgmentDispatchOutboxTransactionPort['listPending']>[0],
  ): Promise<Awaited<ReturnType<AgentJudgmentDispatchOutboxTransactionPort['listPending']>>> {
    const now = new Date();
    const rows = await this.prisma.agentExecutionDispatchOutbox.findMany({
      where: {
        state: 'pending',
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: input.limit,
      select: {
        organizationId: true,
        sessionId: true,
        sessionTaskId: true,
        executionId: true,
        session: { select: { createdByUserId: true } },
      },
    });
    return rows.map((row) => ({
      organizationId: row.organizationId,
      sessionId: row.sessionId,
      taskId: row.sessionTaskId,
      executionId: row.executionId,
      requestedByUserId: row.session.createdByUserId,
    }));
  }

  async claim(input: Parameters<AgentJudgmentDispatchOutboxTransactionPort['claim']>[0]) {
    return this.prisma.$transaction(async (tx) => {
      const row = await find(tx, input);
      if (!row) throw scope();
      if (row.state === 'dispatched') {
        if (!row.operationRunId) throw conflict();
        await exactOperation(tx, row);
        return { state: 'dispatched' as const, operationRunId: row.operationRunId };
      }
      if (row.state !== 'pending') throw conflict();
      const now = new Date();
      if (row.leaseExpiresAt && row.leaseExpiresAt > now)
        return { state: 'pending' as const, leaseToken: null };
      const leaseToken = randomUUID();
      const claimed = await tx.agentExecutionDispatchOutbox.updateMany({
        where: {
          id: row.id,
          state: 'pending',
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
        data: { leaseToken, leaseExpiresAt: new Date(now.getTime() + LEASE_MS) },
      });
      return claimed.count === 1
        ? { state: 'pending' as const, leaseToken }
        : { state: 'pending' as const, leaseToken: null };
    }).catch(rethrow);
  }

  async markDispatched(input: Parameters<AgentJudgmentDispatchOutboxTransactionPort['markDispatched']>[0]) {
    return this.prisma.$transaction(async (tx) => {
      const row = await find(tx, input);
      if (!row) throw scope();
      if (row.state === 'dispatched') {
        if (row.operationRunId !== input.operationRunId) throw conflict();
        await exactOperation(tx, row);
        return { operationRunId: row.operationRunId };
      }
      if (row.state !== 'pending' || row.leaseToken !== input.leaseToken) throw conflict();
      await exactOperation(tx, { ...row, operationRunId: input.operationRunId });
      const marked = await tx.agentExecutionDispatchOutbox.updateMany({
        where: { id: row.id, state: 'pending', leaseToken: input.leaseToken },
        data: {
          state: 'dispatched', operationRunId: input.operationRunId,
          dispatchedAt: new Date(), leaseToken: null, leaseExpiresAt: null,
        },
      });
      if (marked.count !== 1) throw conflict();
      return { operationRunId: input.operationRunId };
    }).catch(rethrow);
  }

  async release(input: Parameters<AgentJudgmentDispatchOutboxTransactionPort['release']>[0]): Promise<void> {
    await this.prisma.agentExecutionDispatchOutbox.updateMany({
      where: {
        organizationId: input.organizationId,
        executionId: input.executionId,
        state: 'pending',
        leaseToken: input.leaseToken,
      },
      data: { leaseToken: null, leaseExpiresAt: null },
    });
  }
}

async function find(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; sessionId: string; taskId: string; executionId: string },
) {
  return tx.agentExecutionDispatchOutbox.findFirst({
    where: {
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      sessionTaskId: input.taskId,
      executionId: input.executionId,
    },
    select: {
      id: true, organizationId: true, sessionId: true, sessionTaskId: true,
      executionId: true, state: true, operationRunId: true, leaseToken: true, leaseExpiresAt: true,
    },
  });
}

async function exactOperation(
  tx: Prisma.TransactionClient,
  row: { organizationId: string; sessionId: string; sessionTaskId: string; executionId: string; operationRunId: string | null },
): Promise<void> {
  if (!row.operationRunId) throw conflict();
  const operation = await tx.operationRun.findFirst({
    where: { id: row.operationRunId, organizationId: row.organizationId },
    select: {
      id: true,
      agentSessionOperationRunOwnership: { select: { sessionId: true, organizationId: true } },
      agentExecutionAttemptBinding: {
        select: { executionId: true, sessionId: true, attempt: { select: { executionId: true, sessionId: true } } },
      },
    },
  });
  if (
    !operation
    || operation.agentSessionOperationRunOwnership?.organizationId !== row.organizationId
    || operation.agentSessionOperationRunOwnership.sessionId !== row.sessionId
    || operation.agentExecutionAttemptBinding?.executionId !== row.executionId
    || operation.agentExecutionAttemptBinding.sessionId !== row.sessionId
    || operation.agentExecutionAttemptBinding.attempt.executionId !== row.executionId
    || operation.agentExecutionAttemptBinding.attempt.sessionId !== row.sessionId
  ) throw conflict();
}

function scope(): AgentOsBoundaryError { return new AgentOsBoundaryError('AGENT_JUDGMENT_DISPATCH_SCOPE_INVALID', 'AGENT_JUDGMENT_DISPATCH_SCOPE_INVALID'); }
function conflict(): AgentOsBoundaryError { return new AgentOsBoundaryError('AGENT_JUDGMENT_DISPATCH_CONFLICT', 'AGENT_JUDGMENT_DISPATCH_CONFLICT'); }
function rethrow(error: unknown): never {
  if (error instanceof AgentOsBoundaryError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2003')) throw conflict();
  throw error;
}
