import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  type CompleteToolInvocationInput,
  type CreateArtifactInput,
  type CreateConversationInput,
  type CreateMessageInput,
  type CreateToolInvocationInput,
} from '../../../application/port/out/repository/agent-os-repository.port';
import { AgentOsBoundaryError } from '../../../domain/agent-os.errors';
import {
  clampLimit,
  toArtifactRecord,
  toConversationRecord,
  toMessageRecord,
  toToolInvocationRecord,
} from './agent-os.repository.mapper';

function nullableJson(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

export class AgentOsConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createConversation(input: CreateConversationInput) {
    const row = await this.prisma.agentConversation.create({
      data: {
        organizationId: input.organizationId,
        title: input.title,
        createdByUserId: input.createdByUserId,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        lastMessageAt: new Date(),
      },
    });
    return toConversationRecord(row);
  }

  async findConversationById(input: {
    organizationId: string;
    conversationId: string;
  }) {
    const row = await this.prisma.agentConversation.findFirst({
      where: {
        id: input.conversationId,
        organizationId: input.organizationId,
      },
    });
    return row ? toConversationRecord(row) : null;
  }

  async listConversations(input: {
    organizationId: string;
    cursor?: string | null;
    limit?: number;
  }) {
    const limit = clampLimit(input.limit, 50);
    const cursor = input.cursor ? { id: input.cursor } : undefined;
    const rows = await this.prisma.agentConversation.findMany({
      where: { organizationId: input.organizationId },
      take: limit,
      skip: cursor ? 1 : 0,
      cursor,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toConversationRecord);
  }

  async updateConversationRootRequest(input: {
    organizationId: string;
    conversationId: string;
    rootRequestId: string;
  }) {
    const request = await this.prisma.agentRunRequest.findFirst({
      where: { id: input.rootRequestId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!request) {
      throw new AgentOsBoundaryError(
        'agent_run_request_not_found',
        `AgentRunRequest ${input.rootRequestId} not found in organization ${input.organizationId}.`,
      );
    }

    const updated = await this.prisma.agentConversation.updateMany({
      where: {
        id: input.conversationId,
        organizationId: input.organizationId,
      },
      data: { rootRequestId: input.rootRequestId },
    });
    if (updated.count !== 1) {
      throw new AgentOsBoundaryError(
        'agent_conversation_not_found',
        `AgentConversation ${input.conversationId} not found in organization ${input.organizationId}.`,
      );
    }
  }

  async createMessage(input: CreateMessageInput) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.agentConversation.updateMany({
        where: {
          id: input.conversationId,
          organizationId: input.organizationId,
        },
        data: { lastMessageAt: now },
      });
      if (conversation.count !== 1) {
        throw new AgentOsBoundaryError(
          'agent_conversation_not_found',
          `AgentConversation ${input.conversationId} not found in organization ${input.organizationId}.`,
        );
      }

      const row = await tx.agentMessage.create({
        data: {
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          agentInstanceId: input.agentInstanceId ?? null,
          requestId: input.requestId ?? null,
          runId: input.runId ?? null,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          createdAt: now,
        },
      });
      return toMessageRecord(row);
    });
  }

  async listMessages(input: {
    organizationId: string;
    conversationId: string;
    cursor?: string | null;
    limit?: number;
  }) {
    const limit = clampLimit(input.limit, 100);
    const cursor = input.cursor ? { id: input.cursor } : undefined;
    const rows = await this.prisma.agentMessage.findMany({
      where: {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
      },
      take: limit,
      skip: cursor ? 1 : 0,
      cursor,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toMessageRecord);
  }

  async createToolInvocation(input: CreateToolInvocationInput) {
    await this.assertConversation(input.organizationId, input.conversationId);
    await this.assertApprovalRequest(input.organizationId, input.approvalRequestId);

    const row = await this.prisma.agentToolInvocation.create({
      data: {
        organizationId: input.organizationId,
        conversationId: input.conversationId ?? null,
        agentInstanceId: input.agentInstanceId,
        requestId: input.requestId ?? null,
        runId: input.runId ?? null,
        approvalRequestId: input.approvalRequestId ?? null,
        capabilityKey: input.capabilityKey,
        policyDecision: input.policyDecision,
        status: input.approvalRequestId ? 'waiting_approval' : 'requested',
        reasonCode: input.reasonCode ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        inputSummary: (input.inputSummary ?? {}) as Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    });
    return toToolInvocationRecord(row);
  }

  async findToolInvocationByIdempotency(input: {
    organizationId: string;
    capabilityKey: string;
    idempotencyKey: string;
  }) {
    const row = await this.prisma.agentToolInvocation.findFirst({
      where: {
        organizationId: input.organizationId,
        capabilityKey: input.capabilityKey,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return row ? toToolInvocationRecord(row) : null;
  }

  async completeToolInvocation(input: CompleteToolInvocationInput) {
    await this.assertApprovalRequest(input.organizationId, input.approvalRequestId);

    const isTerminal =
      input.status === 'succeeded' ||
      input.status === 'failed' ||
      input.status === 'cancelled';
    const updated = await this.prisma.agentToolInvocation.updateMany({
      where: {
        id: input.invocationId,
        organizationId: input.organizationId,
      },
      data: {
        status: input.status,
        approvalRequestId:
          input.approvalRequestId === undefined
            ? undefined
            : input.approvalRequestId,
        outputSummary: nullableJson(input.outputSummary),
        errorCode: input.errorCode ?? undefined,
        errorMessage: input.errorMessage ?? undefined,
        resourceType: input.resourceType ?? undefined,
        resourceId: input.resourceId ?? undefined,
        completedAt: isTerminal ? new Date() : undefined,
      },
    });
    if (updated.count !== 1) {
      throw new AgentOsBoundaryError(
        'agent_tool_invocation_not_found',
        `AgentToolInvocation ${input.invocationId} not found in organization ${input.organizationId}.`,
      );
    }

    const row = await this.prisma.agentToolInvocation.findFirstOrThrow({
      where: {
        id: input.invocationId,
        organizationId: input.organizationId,
      },
    });
    return toToolInvocationRecord(row);
  }

  async listToolInvocations(input: {
    organizationId: string;
    conversationId?: string | null;
    requestId?: string | null;
    runId?: string | null;
  }) {
    const rows = await this.prisma.agentToolInvocation.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(input.requestId ? { requestId: input.requestId } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
      },
      take: 200,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toToolInvocationRecord);
  }

  async createArtifact(input: CreateArtifactInput) {
    await this.assertConversation(input.organizationId, input.conversationId);
    await this.assertToolInvocation(input.organizationId, input.toolInvocationId);

    const row = await this.prisma.agentArtifact.create({
      data: {
        organizationId: input.organizationId,
        conversationId: input.conversationId ?? null,
        agentInstanceId: input.agentInstanceId ?? null,
        requestId: input.requestId ?? null,
        runId: input.runId ?? null,
        toolInvocationId: input.toolInvocationId ?? null,
        artifactType: input.artifactType,
        targetDomain: input.targetDomain,
        targetModel: input.targetModel,
        targetId: input.targetId ?? null,
        title: input.title,
        href: input.href ?? null,
        summary: (input.summary ?? {}) as Prisma.InputJsonValue,
      },
    });
    return toArtifactRecord(row);
  }

  async listArtifacts(input: {
    organizationId: string;
    conversationId?: string | null;
    requestId?: string | null;
    runId?: string | null;
    toolInvocationId?: string | null;
    artifactType?: string | null;
  }) {
    const rows = await this.prisma.agentArtifact.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(input.requestId ? { requestId: input.requestId } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
        ...(input.toolInvocationId ? { toolInvocationId: input.toolInvocationId } : {}),
        ...(input.artifactType ? { artifactType: input.artifactType } : {}),
      },
      take: 200,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toArtifactRecord);
  }

  private async assertConversation(
    organizationId: string,
    conversationId: string | null | undefined,
  ) {
    if (!conversationId) return;
    const conversation = await this.prisma.agentConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { id: true },
    });
    if (!conversation) {
      throw new AgentOsBoundaryError(
        'agent_conversation_not_found',
        `AgentConversation ${conversationId} not found in organization ${organizationId}.`,
      );
    }
  }

  private async assertToolInvocation(
    organizationId: string,
    toolInvocationId: string | null | undefined,
  ) {
    if (!toolInvocationId) return;
    const invocation = await this.prisma.agentToolInvocation.findFirst({
      where: { id: toolInvocationId, organizationId },
      select: { id: true },
    });
    if (!invocation) {
      throw new AgentOsBoundaryError(
        'agent_tool_invocation_not_found',
        `AgentToolInvocation ${toolInvocationId} not found in organization ${organizationId}.`,
      );
    }
  }

  private async assertApprovalRequest(
    organizationId: string,
    approvalRequestId: string | null | undefined,
  ) {
    if (!approvalRequestId) return;
    const approval = await this.prisma.agentApprovalRequest.findFirst({
      where: { id: approvalRequestId, organizationId },
      select: { id: true },
    });
    if (!approval) {
      throw new AgentOsBoundaryError(
        'agent_approval_request_not_found',
        `AgentApprovalRequest ${approvalRequestId} not found in organization ${organizationId}.`,
      );
    }
  }
}
