import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  AgentSessionControlRepositoryError,
} from '../../../../application/port/out/repository/session-control/agent-session-control.persistence.types';
import type { AgentSessionArtifactMaterializationTransactionPort } from '../../../../application/port/out/transaction/session-control/agent-session-artifact-materialization.transaction.port';
import { lockWritableAgentSession } from './internal/lock-writable-agent-session';

@Injectable()
export class PrismaAgentSessionArtifactMaterializationTransaction
  implements AgentSessionArtifactMaterializationTransactionPort
{
  constructor(private readonly prisma: PrismaService) {}

  async prepare(
    input: Parameters<AgentSessionArtifactMaterializationTransactionPort['prepare']>[0],
  ): Promise<{ artifactId: string; lifecycle: 'materializing' | 'active' }> {
    return this.prisma.$transaction(async (tx) => {
      await lockWritableAgentSession(tx, input);
      await assertExactMaterializationOwner(tx, input);
      const idempotencyKey = `runtime-artifact:${input.externalArtifactId}`;
      const existing = await tx.agentSessionArtifact.findFirst({
        where: { executionId: input.executionId, idempotencyKey },
      });
      if (existing) {
        if (
          existing.organizationId !== input.organizationId ||
          existing.sessionId !== input.sessionId ||
          existing.taskId !== input.taskId ||
          existing.artifactType !== input.artifactType ||
          existing.sha256 !== input.sha256 ||
          existing.materializationOperationRunId !== input.operationRunId
        )
          throw conflict();
        return { artifactId: existing.id, lifecycle: parseLifecycle(existing.lifecycle) };
      }
      const artifact = await tx.agentSessionArtifact.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          taskId: input.taskId,
          executionId: input.executionId,
          artifactType: input.artifactType,
          materializationOperationRunId: input.operationRunId,
          sha256: input.sha256,
          lifecycle: 'materializing',
          idempotencyKey,
        },
      });
      await tx.agentSessionArtifactMaterialization.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          artifactId: artifact.id,
          materializationOperationRunId: input.operationRunId,
          providerUploadId: null,
        },
      });
      return { artifactId: artifact.id, lifecycle: 'materializing' };
    });
  }

  async bindUpload(
    input: Parameters<AgentSessionArtifactMaterializationTransactionPort['bindUpload']>[0],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockWritableAgentSession(tx, input);
      await assertExactMaterializationOwner(tx, input);
      const materialization = await tx.agentSessionArtifactMaterialization.findFirst({
        where: {
          artifactId: input.artifactId,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          materializationOperationRunId: input.operationRunId,
        },
      });
      if (!materialization) throw scope();
      if (materialization.providerUploadId === input.uploadId) return;
      if (materialization.providerUploadId !== null) throw state();
      await tx.agentSessionArtifactMaterialization.update({
        where: { id: materialization.id },
        data: { providerUploadId: input.uploadId },
      });
    });
  }

  async activate(
    input: Parameters<AgentSessionArtifactMaterializationTransactionPort['activate']>[0],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockWritableAgentSession(tx, input);
      await assertExactMaterializationOwner(tx, input);
      const artifact = await tx.agentSessionArtifact.findFirst({
        where: {
          id: input.artifactId,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          taskId: input.taskId,
          executionId: input.executionId,
          materializationOperationRunId: input.operationRunId,
        },
      });
      if (!artifact) throw scope();
      if (artifact.sha256 !== input.sha256) throw conflict();
      if (artifact.lifecycle === 'active') return;
      if (artifact.lifecycle !== 'materializing') throw state();
      await tx.agentSessionArtifact.update({
        where: { id: artifact.id },
        data: {
          lifecycle: 'active',
          metadata: input.metadata as Prisma.InputJsonValue,
        },
      });
      await tx.agentSessionArtifactMaterialization.deleteMany({
        where: {
          artifactId: artifact.id,
          organizationId: input.organizationId,
          sessionId: input.sessionId,
          materializationOperationRunId: input.operationRunId,
        },
      });
    });
  }
}

async function assertExactMaterializationOwner(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    sessionId: string;
    taskId?: string;
    executionId?: string;
    operationRunId: string;
    attemptToken: string;
  },
): Promise<void> {
  const run = await tx.operationRun.findFirst({
    where: {
      id: input.operationRunId,
      organizationId: input.organizationId,
      attemptToken: input.attemptToken,
    },
    select: { id: true },
  });
  if (!run) throw state();
  const ownership = await tx.agentSessionOperationRunOwnership.findFirst({
    where: {
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      operationRunId: input.operationRunId,
    },
    select: { id: true },
  });
  if (!ownership) throw scope();
  if (input.executionId && input.taskId) {
    const execution = await tx.agentExecution.findFirst({
      where: {
        id: input.executionId,
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        sessionTaskId: input.taskId,
      },
      select: { id: true },
    });
    if (!execution) throw scope();
  }
}

function parseLifecycle(value: string): 'materializing' | 'active' {
  if (value === 'materializing' || value === 'active') return value;
  throw state();
}

function scope(): AgentSessionControlRepositoryError {
  return new AgentSessionControlRepositoryError(
    'AGENT_SESSION_CONTROL_SCOPE_INVALID',
    'AGENT_SESSION_CONTROL_SCOPE_INVALID',
  );
}

function state(): AgentSessionControlRepositoryError {
  return new AgentSessionControlRepositoryError(
    'AGENT_SESSION_CONTROL_STATE_CONFLICT',
    'AGENT_SESSION_CONTROL_STATE_CONFLICT',
  );
}

function conflict(): AgentSessionControlRepositoryError {
  return new AgentSessionControlRepositoryError(
    'AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT',
    'AGENT_SESSION_CONTROL_IDEMPOTENCY_CONFLICT',
  );
}
