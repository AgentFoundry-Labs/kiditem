import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../../../prisma/prisma.service";
import type { AgentExecutionQueryRepositoryPort } from "../../../../application/port/out/repository/interaction/agent-execution-query.repository.port";
import type {
  AgentExecutionRuntimeContext,
  CurrentAgentExecution,
} from "../../../../application/port/out/repository/interaction/agent-interaction.persistence.types";
import {
  currentExecutionSelect,
  eventSelect,
  mapCurrentExecution,
  mapEvent,
  parseCapabilityKeys,
  sessionLifecycle,
} from "./internal/prisma-interaction.mapping";
@Injectable()
export class PrismaAgentExecutionQueryRepository implements AgentExecutionQueryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}
  async loadExecutionRuntimeContext(input: {
    executionId: string;
  }): Promise<AgentExecutionRuntimeContext | null> {
    const execution = await this.prisma.agentExecution.findUnique({
      where: { id: input.executionId },
      select: {
        id: true,
        organizationId: true,
        sessionId: true,
        sessionTaskId: true,
        copilotThreadId: true,
        aguiRunId: true,
        agentVersionId: true,
        runtimeType: true,
        modelIdentity: true,
        policySnapshotId: true,
        attempts: {
          where: {
            state: 'running',
            operationBindings: {
              some: {
                operationRun: {
                  status: 'running',
                  attemptToken: { not: null },
                },
              },
            },
          },
          select: {
            id: true,
            runtimeType: true,
            runtimeStartIntentId: true,
            runtimeCredentialGeneration: true,
            state: true,
            operationBindings: {
              where: {
                operationRun: {
                  status: 'running',
                  attemptToken: { not: null },
                },
              },
              select: {
                operationRunId: true,
                operationRun: { select: { attemptToken: true } },
              },
            },
          },
        },
        session: {
          select: {
            createdByUserId: true,
            contextEpoch: true,
            lifecycle: true,
          },
        },
        policySnapshot: { select: { capabilityKeys: true, policyHash: true } },
        agentVersion: { select: { agentDefinitionKey: true, version: true } },
      },
    });
    if (!execution || execution.attempts.length !== 1) return null;
    const attempt = execution.attempts[0]!;
    const binding = attempt.operationBindings[0];
    if (
      attempt.runtimeType !== execution.runtimeType ||
      attempt.state !== "running" ||
      !attempt.runtimeStartIntentId ||
      attempt.operationBindings.length !== 1 ||
      !binding ||
      !binding.operationRun.attemptToken
    )
      return null;
    const initialUserEvent = await this.prisma.agentConversationEvent.findFirst(
      {
        where: {
          organizationId: execution.organizationId,
          sessionId: execution.sessionId,
          executionId: execution.id,
          eventType: "user_message",
        },
        select: eventSelect,
        orderBy: [{ sequence: "asc" }, { id: "asc" }],
      },
    );
    if (!initialUserEvent) return null;
    const lifecycle = sessionLifecycle(execution.session.lifecycle);
    return {
      organizationId: execution.organizationId,
      userId: execution.session.createdByUserId,
      agentDefinitionKey: execution.agentVersion.agentDefinitionKey,
      sessionId: execution.sessionId,
      sessionTaskId: execution.sessionTaskId,
      executionId: execution.id,
      attemptId: attempt.id,
      operationRunId: binding.operationRunId,
      operationAttemptToken: binding.operationRun.attemptToken,
      startIntentId: attempt.runtimeStartIntentId,
      runtimeCredentialGeneration: attempt.runtimeCredentialGeneration,
      copilotThreadId: execution.copilotThreadId,
      aguiRunId: execution.aguiRunId,
      agentVersionId: execution.agentVersionId,
      agentVersion: execution.agentVersion.version,
      runtimeType: execution.runtimeType,
      modelIdentity: execution.modelIdentity,
      policySnapshotId: execution.policySnapshotId,
      policyHash: execution.policySnapshot.policyHash,
      contextEpoch: execution.session.contextEpoch,
      lifecycle,
      capabilityKeys: parseCapabilityKeys(
        execution.policySnapshot.capabilityKeys,
      ),
      initialUserEvent: mapEvent(initialUserEvent),
    };
  }
  async findCurrentExecution(input: {
    executionId: string;
  }): Promise<CurrentAgentExecution | null> {
    const row = await this.prisma.agentExecution.findUnique({
      where: { id: input.executionId },
      select: currentExecutionSelect,
    });
    return row ? mapCurrentExecution(row) : null;
  }
  async findAccessibleCurrentExecution(input: {
    organizationId: string;
    userId: string;
    sessionId: string;
    copilotThreadId: string;
  }): Promise<CurrentAgentExecution | null> {
    const row = await this.prisma.agentExecution.findFirst({
      where: {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        copilotThreadId: input.copilotThreadId,
        status: "running",
        session: { createdByUserId: input.userId },
      },
      select: currentExecutionSelect,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    });
    return row ? mapCurrentExecution(row) : null;
  }
  async findCurrentSessionExecution(input: {
    sessionId: string;
    copilotThreadId: string;
  }): Promise<CurrentAgentExecution | null> {
    const row = await this.prisma.agentExecution.findFirst({
      where: {
        sessionId: input.sessionId,
        copilotThreadId: input.copilotThreadId,
        status: "running",
      },
      select: currentExecutionSelect,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    });
    return row ? mapCurrentExecution(row) : null;
  }
}
