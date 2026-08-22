import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  AGENT_SESSION_DELETE_MAX_ATTEMPTS,
} from '../../../../domain/operation/agent-session-deletion.operations';
import { lockAgentSessionForDeletion } from '../session-control/internal/lock-writable-agent-session';
import type {
  AgentSessionDeletionFinalizationTransactionPort,
  DeletionFinalizerCandidate,
  InterruptedDeletionCandidate,
} from '../../../../application/port/out/transaction/session-deletion/agent-session-deletion-finalization.transaction.port';

const LIFECYCLE_CANCELLATION_CODES = [
  'operation_server_lifecycle_expired',
  'operation_server_shutdown',
] as const;

@Injectable()
export class PrismaAgentSessionDeletionFinalizationTransaction
  implements AgentSessionDeletionFinalizationTransactionPort
{
  constructor(private readonly prisma: PrismaService) {}

  async purgeGraphDeletedLineage(input: {
    signal: AbortSignal;
    organizationId: string;
    sessionId: string;
    currentOperationRunId: string;
    expectedAttemptToken: string | null;
  }): Promise<void> {
    input.signal.throwIfAborted();
    await this.prisma.$transaction(async (tx) => {
      await lockDeletionScope(tx, input);
      const binding = await tx.agentSessionDeletionOperationBinding.findUnique({
        where: {
          operationRunId_organizationId: {
            operationRunId: input.currentOperationRunId,
            organizationId: input.organizationId,
          },
        },
        select: {
          sessionId: true,
          operationRun: { select: { attemptToken: true } },
        },
      });
      if (!binding) {
        const run = await tx.operationRun.findUnique({
          where: {
            id_organizationId: {
              id: input.currentOperationRunId,
              organizationId: input.organizationId,
            },
          },
          select: { id: true },
        });
        if (!run) return;
        throw invariant();
      }
      if (
        binding.sessionId !== input.sessionId ||
        (input.expectedAttemptToken !== null &&
          binding.operationRun.attemptToken !== input.expectedAttemptToken)
      ) throw invariant();
      const checkpoint = await tx.operationRunCheckpoint.findFirst({
        where: {
          organizationId: input.organizationId,
          operationRunId: input.currentOperationRunId,
          kind: 'graph_deleted',
        },
        select: { state: true },
        orderBy: { sequence: 'desc' },
      });
      if (!checkpointHasSession(checkpoint?.state, input.sessionId)) throw invariant();

      const lineage = await tx.agentSessionDeletionOperationBinding.findMany({
        where: { organizationId: input.organizationId, sessionId: input.sessionId },
        select: { operationRunId: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const lineageRunIds = lineage.map((entry) => entry.operationRunId);
      await tx.agentSessionDeletionOperationBinding.deleteMany({
        where: { organizationId: input.organizationId, sessionId: input.sessionId },
      });
      if (lineageRunIds.length > 0) {
        await tx.operationRunCheckpoint.deleteMany({
          where: {
            organizationId: input.organizationId,
            operationRunId: { in: lineageRunIds },
          },
        });
        for (const operationRunId of lineageRunIds) {
          await tx.operationRun.delete({
            where: {
              id_organizationId: { id: operationRunId, organizationId: input.organizationId },
            },
          });
        }
      }
    });
  }

  async listGraphDeletedFinalizers(input: {
    limit: number;
  }): Promise<readonly DeletionFinalizerCandidate[]> {
    const rows = await this.prisma.agentSessionDeletionOperationBinding.findMany({
      where: {
        operationRun: { checkpoints: { some: { kind: 'graph_deleted' } } },
      },
      select: { organizationId: true, sessionId: true, operationRunId: true },
      orderBy: [{ organizationId: 'asc' }, { sessionId: 'asc' }, { operationRunId: 'asc' }],
      take: input.limit,
    });
    return rows.map((row) => ({
      organizationId: row.organizationId,
      sessionId: row.sessionId,
      currentOperationRunId: row.operationRunId,
    }));
  }

  async listInterruptedDeletions(input: {
    limit: number;
  }): Promise<readonly InterruptedDeletionCandidate[]> {
    const sessions = await this.prisma.agentSession.findMany({
      where: {
        lifecycle: 'deleting',
        deletionOperationRunId: { not: null },
        deletionOperationRun: {
          is: {
            status: 'cancelled',
            errorCode: { in: [...LIFECYCLE_CANCELLATION_CODES] },
          },
        },
      },
      select: { id: true, organizationId: true, deletionOperationRunId: true },
      orderBy: [{ organizationId: 'asc' }, { id: 'asc' }],
      take: input.limit,
    });
    const candidates: InterruptedDeletionCandidate[] = [];
    for (const session of sessions) {
      if (!session.deletionOperationRunId) continue;
      const binding = await this.prisma.agentSessionDeletionOperationBinding.findUnique({
        where: {
          operationRunId_organizationId: {
            operationRunId: session.deletionOperationRunId,
            organizationId: session.organizationId,
          },
        },
        select: { sessionId: true, retryGeneration: true },
      });
      if (!binding || binding.sessionId !== session.id) continue;
      const generation = await this.prisma.agentSessionDeletionOperationBinding.findMany({
        where: {
          organizationId: session.organizationId,
          sessionId: session.id,
          retryGeneration: binding.retryGeneration,
        },
        select: { operationRun: { select: { attempts: true } } },
      });
      candidates.push({
        organizationId: session.organizationId,
        sessionId: session.id,
        currentOperationRunId: session.deletionOperationRunId,
        retryGeneration: binding.retryGeneration,
        consumedAttempts: generation.reduce((sum, row) => sum + row.operationRun.attempts, 0),
      });
    }
    return candidates;
  }

  async continueInterruptedDeletion(
    input: InterruptedDeletionCandidate,
  ): Promise<'continued' | 'failed'> {
    return this.prisma.$transaction(async (tx) => {
      const session = await lockAgentSessionForDeletion(tx, input);
      if (
        !session ||
        session.lifecycle !== 'deleting' ||
        session.deletionOperationRunId !== input.currentOperationRunId
      ) return 'continued';
      const current = await tx.agentSessionDeletionOperationBinding.findUnique({
        where: {
          operationRunId_organizationId: {
            operationRunId: input.currentOperationRunId,
            organizationId: input.organizationId,
          },
        },
        select: {
          sessionId: true,
          retryGeneration: true,
          deletionRequestedByUserId: true,
          operationRun: {
            select: {
              status: true,
              errorCode: true,
              operationKey: true,
              definitionVersion: true,
              ownerDomain: true,
              title: true,
              engineType: true,
              resourceClass: true,
              executionTimeoutMs: true,
              triggerSource: true,
              requestedByUserId: true,
              input: true,
            },
          },
        },
      });
      if (
        !current ||
        current.sessionId !== input.sessionId ||
        current.retryGeneration !== input.retryGeneration ||
        current.operationRun.status !== 'cancelled' ||
        !LIFECYCLE_CANCELLATION_CODES.includes(
          current.operationRun.errorCode as (typeof LIFECYCLE_CANCELLATION_CODES)[number],
        )
      ) return 'continued';

      const generation = await tx.agentSessionDeletionOperationBinding.findMany({
        where: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          retryGeneration: input.retryGeneration,
        },
        select: { operationRun: { select: { attempts: true } } },
      });
      const consumedAttempts = generation.reduce((sum, row) => sum + row.operationRun.attempts, 0);
      if (consumedAttempts >= AGENT_SESSION_DELETE_MAX_ATTEMPTS) {
        await tx.agentSession.update({
          where: { id: input.sessionId },
          data: {
            lifecycle: 'delete_failed',
            deletionFailureCode: 'SESSION_DELETION_INVARIANT',
          },
        });
        return 'failed';
      }

      const successor = await tx.operationRun.create({
        data: {
          organizationId: input.organizationId,
          operationKey: current.operationRun.operationKey,
          definitionVersion: current.operationRun.definitionVersion,
          ownerDomain: current.operationRun.ownerDomain,
          title: current.operationRun.title,
          engineType: current.operationRun.engineType,
          resourceClass: current.operationRun.resourceClass,
          executionTimeoutMs: current.operationRun.executionTimeoutMs,
          triggerSource: current.operationRun.triggerSource,
          requestedByUserId: current.operationRun.requestedByUserId,
          idempotencyKey: `agent-session-delete:${input.sessionId}:generation:${input.retryGeneration}:lifecycle:${input.currentOperationRunId}`,
          input: current.operationRun.input as Prisma.InputJsonValue,
          maxAttempts: AGENT_SESSION_DELETE_MAX_ATTEMPTS - consumedAttempts,
        },
        select: { id: true },
      });
      await tx.agentSessionDeletionOperationBinding.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          sessionCreatorUserId: session.createdByUserId,
          deletionRequestedByUserId: current.deletionRequestedByUserId,
          retryGeneration: input.retryGeneration,
          operationRunId: successor.id,
          predecessorOperationRunId: input.currentOperationRunId,
        },
      });
      await tx.agentSession.update({
        where: { id: input.sessionId },
        data: { deletionOperationRunId: successor.id },
      });
      return 'continued';
    });
  }
}

async function lockDeletionScope(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; sessionId: string },
): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-session-lifecycle:${input.organizationId}:${input.sessionId}`}, 0))`,
  );
}

function checkpointHasSession(state: unknown, sessionId: string): boolean {
  return Boolean(
    state &&
    typeof state === 'object' &&
    !Array.isArray(state) &&
    (state as Record<string, unknown>).sessionId === sessionId,
  );
}

function invariant(): Error {
  return new Error('SESSION_DELETION_INVARIANT');
}
