import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AgentSessionDeletionStatusSchema,
  type AgentSessionDeletionStatus,
} from '@kiditem/shared/agent-interaction';
import {
  formatOrganizationName,
  OrganizationIdSchema,
  parseAgentSessionName,
  UserIdSchema,
} from '@kiditem/shared/identifiers';
import { PrismaService } from '../../../../../prisma/prisma.service';
import type { ScopedDeletionActor } from '../../../../application/port/in/session-control/agent-session-deletion.port';
import type { AgentSessionDeletionCommandTransactionPort } from '../../../../application/port/out/transaction/session-deletion/agent-session-deletion-command.transaction.port';
import { AgentOsRuntimeError } from '../../../../domain/agent-os.errors';
import { AgentSessionDeleteOperationInputSchema } from '../../../../domain/operation/agent-session-deletion.operations';
import { lockAgentSessionForDeletion } from '../session-control/internal/lock-writable-agent-session';

@Injectable()
export class PrismaAgentSessionDeletionCommandTransaction
  implements AgentSessionDeletionCommandTransactionPort
{
  constructor(private readonly prisma: PrismaService) {}

  async begin(
    input: Parameters<AgentSessionDeletionCommandTransactionPort['begin']>[0],
  ): Promise<AgentSessionDeletionStatus | null> {
    const scope = parseScope(input);
    if (!scope) return null;
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      input.signal.throwIfAborted();
      const session = await lockAgentSessionForDeletion(tx, scope);
      if (!session) return null;
      if (!await authorized(tx, scope, session.createdByUserId)) return null;
      const replay = status(session.lifecycle, session.deletionFailureCode);
      if (replay) return replay;

      const parsedInput = AgentSessionDeleteOperationInputSchema.parse(input.parsedInput);
      if (parsedInput.session !== input.session || parsedInput.retryGeneration !== 1) {
        throw stateInvalid();
      }
      const operation = await tx.operationRun.create({
        data: {
          organizationId: scope.organizationId,
          operationKey: input.definition.key,
          definitionVersion: input.definition.version,
          ownerDomain: input.definition.ownerDomain,
          title: input.definition.title,
          engineType: input.definition.engineType,
          resourceClass: input.definition.resourceClass,
          executionTimeoutMs: input.definition.executionTimeoutMs,
          triggerSource: 'system',
          requestedByUserId: scope.actorUserId,
          idempotencyKey: `agent-session-delete:${scope.sessionId}:generation:1`,
          input: parsedInput as Prisma.InputJsonValue,
          maxAttempts: input.definition.maxAttempts,
        },
        select: { id: true },
      });
      await tx.agentSessionDeletionOperationBinding.create({
        data: {
          organizationId: scope.organizationId,
          sessionId: scope.sessionId,
          sessionCreatorUserId: session.createdByUserId,
          deletionRequestedByUserId: scope.actorUserId,
          retryGeneration: 1,
          operationRunId: operation.id,
          predecessorOperationRunId: null,
        },
      });
      await tx.agentSession.update({
        where: { id: scope.sessionId },
        data: {
          lifecycle: 'deleting',
          deletionRequestedAt: new Date(),
          deletionRequestedByUserId: scope.actorUserId,
          deletionOperationRunId: operation.id,
          deletionFailureCode: null,
        },
      });
      await tx.agentExecutionAttempt.updateMany({
        where: { organizationId: scope.organizationId, sessionId: scope.sessionId },
        data: { runtimeCredentialGeneration: { increment: 1 } },
      });
      input.signal.throwIfAborted();
      return { state: 'deleting' as const, failureCode: null };
    });
  }

  async retry(
    input: Parameters<AgentSessionDeletionCommandTransactionPort['retry']>[0],
  ): Promise<AgentSessionDeletionStatus | null> {
    const scope = parseScope(input);
    if (!scope) return null;
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      input.signal.throwIfAborted();
      const session = await lockAgentSessionForDeletion(tx, scope);
      if (!session) return null;
      const membership = await activeMembership(tx, scope);
      if (!membership) return null;
      const administrator = membership.role === 'owner' || membership.role === 'admin';
      const creator = scope.actorUserId === session.createdByUserId;
      if (!administrator && !creator) return null;
      if (session.lifecycle !== 'delete_failed') throw stateInvalid();
      if (!administrator) throw adminRequired();
      if (!session.deletionOperationRunId) throw stateInvalid();
      const current = await tx.agentSessionDeletionOperationBinding.findUnique({
        where: { operationRunId_organizationId: {
          operationRunId: session.deletionOperationRunId,
          organizationId: scope.organizationId,
        } },
        select: { sessionId: true, retryGeneration: true, operationRunId: true },
      });
      if (!current || current.sessionId !== scope.sessionId) throw stateInvalid();
      const generation = await tx.agentSessionDeletionOperationBinding.findMany({
        where: {
          organizationId: scope.organizationId,
          sessionId: scope.sessionId,
          retryGeneration: current.retryGeneration,
        },
        select: { operationRun: { select: { attempts: true, maxAttempts: true } } },
      });
      const attempts = generation.reduce(
        (total, binding) => total + binding.operationRun.attempts,
        0,
      );
      const budget = generation.reduce(
        (total, binding) => total + binding.operationRun.maxAttempts,
        0,
      );
      if (!generation.length || attempts < budget) throw stateInvalid();

      const retryGeneration = current.retryGeneration + 1;
      const parsedInput = AgentSessionDeleteOperationInputSchema.parse({
        session: input.session,
        retryGeneration,
      });
      const operation = await tx.operationRun.create({
        data: {
          organizationId: scope.organizationId,
          operationKey: input.definition.key,
          definitionVersion: input.definition.version,
          ownerDomain: input.definition.ownerDomain,
          title: input.definition.title,
          engineType: input.definition.engineType,
          resourceClass: input.definition.resourceClass,
          executionTimeoutMs: input.definition.executionTimeoutMs,
          triggerSource: 'system',
          requestedByUserId: scope.actorUserId,
          idempotencyKey: `agent-session-delete:${scope.sessionId}:generation:${retryGeneration}`,
          input: parsedInput as Prisma.InputJsonValue,
          maxAttempts: input.definition.maxAttempts,
        },
        select: { id: true },
      });
      await tx.agentSessionDeletionOperationBinding.create({
        data: {
          organizationId: scope.organizationId,
          sessionId: scope.sessionId,
          sessionCreatorUserId: session.createdByUserId,
          deletionRequestedByUserId: scope.actorUserId,
          retryGeneration,
          operationRunId: operation.id,
          predecessorOperationRunId: current.operationRunId,
        },
      });
      await tx.agentSession.update({
        where: { id: scope.sessionId },
        data: {
          lifecycle: 'deleting',
          deletionOperationRunId: operation.id,
          deletionFailureCode: null,
        },
      });
      await tx.agentExecutionAttempt.updateMany({
        where: { organizationId: scope.organizationId, sessionId: scope.sessionId },
        data: { runtimeCredentialGeneration: { increment: 1 } },
      });
      input.signal.throwIfAborted();
      return { state: 'deleting' as const, failureCode: null };
    });
  }
}

function parseScope(input: ScopedDeletionActor): {
  organizationId: string;
  actorUserId: string;
  sessionId: string;
} | null {
  try {
    const organizationId = OrganizationIdSchema.parse(input.organizationId);
    const actorUserId = UserIdSchema.parse(input.actorUserId);
    const session = parseAgentSessionName(
      input.session,
      formatOrganizationName(organizationId),
    );
    return { organizationId, actorUserId, sessionId: session.session };
  } catch {
    return null;
  }
}

async function authorized(
  tx: Prisma.TransactionClient,
  scope: { organizationId: string; actorUserId: string },
  creatorUserId: string,
): Promise<boolean> {
  const membership = await activeMembership(tx, scope);
  return Boolean(
    membership && (
      scope.actorUserId === creatorUserId ||
      membership.role === 'owner' ||
      membership.role === 'admin'
    ),
  );
}

function activeMembership(
  tx: Prisma.TransactionClient,
  scope: { organizationId: string; actorUserId: string },
) {
  return tx.organizationMembership.findFirst({
    where: {
      organizationId: scope.organizationId,
      userId: scope.actorUserId,
      status: 'active',
    },
    select: { role: true },
  });
}

function status(
  lifecycle: string,
  failureCode: string | null,
): AgentSessionDeletionStatus | null {
  const parsed = AgentSessionDeletionStatusSchema.safeParse({
    state: lifecycle,
    failureCode,
  });
  return parsed.success ? parsed.data : null;
}

function adminRequired(): AgentOsRuntimeError {
  return new AgentOsRuntimeError(
    'DELETION_RETRY_ADMIN_REQUIRED',
    'Only an organization owner or administrator can retry session deletion.',
  );
}

function stateInvalid(): AgentOsRuntimeError {
  return new AgentOsRuntimeError(
    'DELETION_RETRY_STATE_INVALID',
    'The AgentSession deletion is not ready for retry.',
  );
}
