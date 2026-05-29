import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../port/in/agent-runner.port';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../port/out/repository/agent-os-repository.port';

const DEFAULT_PLAYBOOK_KEY = 'sourcing_market_opportunity_to_order_draft_v1';

export interface StartConversationInput {
  organizationId: string;
  userId: string;
  content: string;
}

function titleFromContent(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  return compact.length > 40 ? `${compact.slice(0, 40)}...` : compact;
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function numberField(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

@Injectable()
export class AgentConversationService {
  constructor(
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
    @Inject(AGENT_RUNNER_PORT)
    private readonly runner: AgentRunnerPort,
  ) {}

  async startConversation(input: StartConversationInput) {
    const conversation = await this.repository.createConversation({
      organizationId: input.organizationId,
      title: titleFromContent(input.content),
      createdByUserId: input.userId,
      metadata: { surface: 'agent_os' },
    });

    const message = await this.repository.createMessage({
      organizationId: input.organizationId,
      conversationId: conversation.id,
      role: 'user',
      content: input.content,
      metadata: {},
    });

    const root = await this.runner.runByType('manager', {
      organizationId: input.organizationId,
      requestedByUserId: input.userId,
      requestedByActorType: 'user',
      requestedByActorId: input.userId,
      taskKey: `conversation:${conversation.id}`,
      sourceType: 'agent_os_conversation',
      sourceResourceType: 'agent_conversation',
      sourceResourceId: conversation.id,
      conversationId: conversation.id,
      initiatedByMessageId: message.id,
      playbookKey: DEFAULT_PLAYBOOK_KEY,
      planStepKey: 'operator',
      displayName: 'Operator',
      payload: {
        playbookKey: DEFAULT_PLAYBOOK_KEY,
        userMessage: input.content,
        conversationId: conversation.id,
        requestedByUserId: input.userId,
      },
    });

    if (root.requestId) {
      await this.repository.updateConversationRootRequest({
        organizationId: input.organizationId,
        conversationId: conversation.id,
        rootRequestId: root.requestId,
      });
    }

    return { conversation, message, rootRequestId: root.requestId ?? null };
  }

  async listConversations(input: { organizationId: string }) {
    return this.repository.listConversations({
      organizationId: input.organizationId,
      limit: 50,
    });
  }

  async listMessages(input: { organizationId: string; conversationId: string }) {
    const conversation = await this.repository.findConversationById(input);
    if (!conversation) {
      throw new NotFoundException('Agent conversation not found');
    }
    return this.repository.listMessages({ ...input, limit: 200 });
  }

  async createOrderDraftFromRecommendation(input: {
    organizationId: string;
    userId: string;
    conversationId: string;
    artifactId: string;
  }) {
    const artifacts = await this.repository.listArtifacts({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      artifactType: 'sourcing_recommendation',
    });
    const artifact = artifacts.find((item) => item.id === input.artifactId);
    if (!artifact) {
      throw new NotFoundException('Sourcing recommendation not found');
    }

    const summary = artifact.summary;
    const result = await this.runner.runByType('order', {
      organizationId: input.organizationId,
      requestedByUserId: input.userId,
      requestedByActorType: 'user',
      requestedByActorId: input.userId,
      taskKey: `conversation:${input.conversationId}:order_draft`,
      sourceType: 'agent_os_selection',
      sourceResourceType: 'agent_artifact',
      sourceResourceId: artifact.id,
      conversationId: input.conversationId,
      parentRequestId: artifact.requestId ?? undefined,
      playbookKey: DEFAULT_PLAYBOOK_KEY,
      planStepKey: 'order_draft',
      displayName: 'Order Agent',
      payload: {
        conversationId: input.conversationId,
        recommendationArtifactId: artifact.id,
        productName: stringField(summary.productName, artifact.title),
        supplierName: stringField(summary.supplierName, '1688 supplier'),
        unitPriceCny: numberField(summary.unitPriceCny, 22.8),
        moq: numberField(summary.moq, 2),
        testQuantity: 6,
      },
    });

    await this.repository.createMessage({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      role: 'user',
      content: `발주 초안 생성 요청: ${artifact.title}`,
      requestId: result.requestId ?? null,
      metadata: { selectedArtifactId: artifact.id },
    });

    return result;
  }
}
