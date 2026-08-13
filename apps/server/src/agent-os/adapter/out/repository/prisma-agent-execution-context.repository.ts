import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  AgentExecutionContextGraph,
  AgentExecutionContextRepositoryPort,
} from '../../../application/port/out/repository/agent-execution-context.repository.port';

@Injectable()
export class PrismaAgentExecutionContextRepository
  implements AgentExecutionContextRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async loadExecutionGraph(input: {
    organizationId: string;
    sessionId: string;
    sessionTaskId: string;
    executionId: string;
    attemptId: string;
  }): Promise<AgentExecutionContextGraph | null> {
    const execution = await this.prisma.agentExecution.findFirst({
      where: {
        id: input.executionId,
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        sessionTaskId: input.sessionTaskId,
        attempts: { some: { id: input.attemptId } },
      },
      select: {
        id: true,
        organizationId: true,
        sessionId: true,
        sessionTaskId: true,
        agentVersionId: true,
        runtimeType: true,
        modelIdentity: true,
        policySnapshotId: true,
        inputHash: true,
        currentInput: true,
        resourceRefs: true,
        session: { select: { lifecycle: true } },
        sessionTask: { select: { status: true, assignedAgentVersionId: true } },
        agentVersion: {
          select: {
            agentDefinitionKey: true,
            runtimeManifest: true,
          },
        },
        policySnapshot: {
          select: { capabilityKeys: true, agentVersionId: true },
        },
        attempts: {
          where: { id: input.attemptId },
          select: { id: true, runtimeType: true },
          take: 1,
        },
      },
    });
    const attempt = execution?.attempts[0];
    if (
      !execution ||
      !attempt ||
      execution.sessionTask.assignedAgentVersionId !== execution.agentVersionId ||
      execution.policySnapshot.agentVersionId !== execution.agentVersionId ||
      attempt.runtimeType !== execution.runtimeType
    ) return null;
    const currentUserExternalEventId = userEventExternalId(execution.currentInput);
    if (!currentUserExternalEventId) return null;
    const currentUserEvent = await this.prisma.agentConversationEvent.findFirst({
      where: {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        externalEventId: currentUserExternalEventId,
        eventType: 'user_message',
      },
      select: {
        externalEventId: true,
        sequence: true,
        eventType: true,
        schemaVersion: true,
        payload: true,
      },
      orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
    });
    if (!currentUserEvent) return null;
    return {
      organizationId: execution.organizationId,
      sessionId: execution.sessionId,
      sessionLifecycle: execution.session.lifecycle,
      sessionTaskId: execution.sessionTaskId,
      taskStatus: execution.sessionTask.status,
      executionId: execution.id,
      attemptId: attempt.id,
      agentVersionId: execution.agentVersionId,
      agentDefinitionKey: execution.agentVersion.agentDefinitionKey,
      runtimeType: execution.runtimeType,
      modelIdentity: execution.modelIdentity,
      policySnapshotId: execution.policySnapshotId,
      versionManifest: execution.agentVersion.runtimeManifest,
      policyCapabilityKeys: execution.policySnapshot.capabilityKeys,
      inputHash: execution.inputHash,
      currentInput: execution.currentInput,
      currentResourceRefs: execution.resourceRefs,
      currentUserEvent: {
        externalEventId: currentUserEvent.externalEventId,
        sequence: currentUserEvent.sequence,
        eventType: currentUserEvent.eventType,
        schemaVersion: currentUserEvent.schemaVersion,
        payload: currentUserEvent.payload as Prisma.JsonValue,
      },
    } as AgentExecutionContextGraph;
  }
}

function userEventExternalId(value: Prisma.JsonValue): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const userEvent = value.userEvent;
  if (!userEvent || typeof userEvent !== 'object' || Array.isArray(userEvent)) {
    return null;
  }
  return typeof userEvent.externalEventId === 'string'
    ? userEvent.externalEventId
    : null;
}
