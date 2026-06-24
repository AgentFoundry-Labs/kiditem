import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../port/out/repository/agent-os-repository.port';

export interface GetConversationGraphInput {
  organizationId: string;
  conversationId: string;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

@Injectable()
export class AgentRunGraphService {
  constructor(
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
  ) {}

  async getConversationGraph(input: GetConversationGraphInput) {
    const conversation = await this.repository.findConversationById(input);
    if (!conversation) {
      throw new NotFoundException('Agent conversation not found');
    }

    const [requests, toolInvocations, artifacts] = await Promise.all([
      this.repository.listRunRequests({
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        limit: 200,
      }),
      this.repository.listToolInvocations(input),
      this.repository.listArtifacts(input),
    ]);

    const sortedRequests = [...requests].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );

    return {
      conversationId: conversation.id,
      rootRequestId: conversation.rootRequestId,
      nodes: sortedRequests.map((request) => ({
        id: request.id,
        parentId: request.parentRequestId,
        kind: 'agent_task' as const,
        label: request.displayName ?? request.agentType,
        status: request.status,
        agentType: request.agentType,
        capabilityKey: null,
        startedAt: iso(request.claimedAt),
        finishedAt: iso(request.finishedAt),
      })),
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id,
        conversationId: artifact.conversationId,
        requestId: artifact.requestId,
        runId: artifact.runId,
        toolInvocationId: artifact.toolInvocationId,
        artifactType: artifact.artifactType,
        targetDomain: artifact.targetDomain,
        targetModel: artifact.targetModel,
        targetId: artifact.targetId,
        title: artifact.title,
        href: artifact.href,
        summary: artifact.summary,
        status: artifact.status,
        createdAt: artifact.createdAt.toISOString(),
      })),
      toolInvocations: toolInvocations.map((tool) => ({
        id: tool.id,
        organizationId: tool.organizationId,
        agentInstanceId: tool.agentInstanceId,
        requestId: tool.requestId,
        runId: tool.runId,
        approvalRequestId: tool.approvalRequestId,
        capabilityKey: tool.capabilityKey,
        status: tool.status,
        policyDecision: tool.policyDecision,
        reasonCode: tool.reasonCode,
        resourceType: tool.resourceType,
        resourceId: tool.resourceId,
        idempotencyKey: tool.idempotencyKey,
        inputSummary: tool.inputSummary,
        outputSummary: tool.outputSummary,
        errorCode: tool.errorCode,
        errorMessage: tool.errorMessage,
        startedAt: iso(tool.startedAt),
        completedAt: iso(tool.completedAt),
        createdAt: tool.createdAt.toISOString(),
      })),
    };
  }
}
