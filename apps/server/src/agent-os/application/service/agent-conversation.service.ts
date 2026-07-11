import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AgentArtifactHandoffSummarySchema } from '@kiditem/shared/agent-os';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
  type AgentRunnerResult,
} from '../port/in/agent-runner.port';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../port/out/repository/agent-os-repository.port';
import { AgentTaskDelegationService } from './agent-task-delegation.service';

const SOURCING_MARKET_PLAYBOOK_KEY = 'sourcing_market_opportunity_to_order_draft_v1';

export interface StartConversationInput {
  organizationId: string;
  userId: string;
  content: string;
}

export interface SendConversationMessageInput extends StartConversationInput {
  conversationId: string;
}

function titleFromContent(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  return compact.length > 40 ? `${compact.slice(0, 40)}...` : compact;
}

function requiredStringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requiredPositiveNumberField(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function optionalPositiveIntegerField(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value > 0
    ? value
    : undefined;
}

function requireOperatorRequestId(result: AgentRunnerResult): string {
  if (result.ok && result.requestId) return result.requestId;

  throw new ServiceUnavailableException({
    code: 'agent_operator_unavailable',
    message: 'Operator is not configured for this organization.',
    reason: result.reason ?? 'operator_request_not_created',
  });
}

function orderDraftPayloadFromSummary(
  summary: Record<string, unknown>,
  artifactId: string,
): Record<string, unknown> {
  const productName = requiredStringField(summary.productName);
  const supplierName = requiredStringField(summary.supplierName);
  const unitPriceCny = requiredPositiveNumberField(summary.unitPriceCny);
  const moq = optionalPositiveIntegerField(summary.moq);

  if (!productName || !supplierName || unitPriceCny === null || moq === undefined) {
    throw new BadRequestException(
      'Selected recommendation is missing required order handoff fields',
    );
  }

  const testQuantity = optionalPositiveIntegerField(summary.testQuantity);
  return {
    recommendationArtifactId: artifactId,
    productName,
    supplierName,
    unitPriceCny,
    moq,
    ...(testQuantity === undefined ? {} : { testQuantity }),
  };
}

@Injectable()
export class AgentConversationService {
  constructor(
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
    @Inject(AGENT_RUNNER_PORT)
    private readonly runner: AgentRunnerPort,
    private readonly delegation: AgentTaskDelegationService,
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
      playbookKey: null,
      planStepKey: 'operator',
      displayName: 'Operator',
      payload: {
        userMessage: input.content,
        conversationId: conversation.id,
        requestedByUserId: input.userId,
      },
    });

    const rootRequestId = requireOperatorRequestId(root);
    await this.repository.updateConversationRootRequest({
      organizationId: input.organizationId,
      conversationId: conversation.id,
      rootRequestId,
    });

    return { conversation, message, rootRequestId };
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

  async sendMessage(input: SendConversationMessageInput) {
    const conversation = await this.repository.findConversationById({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    });
    if (!conversation) {
      throw new NotFoundException('Agent conversation not found');
    }

    const message = await this.repository.createMessage({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      role: 'user',
      content: input.content,
      metadata: {},
    });

    const root = await this.runner.runByType('manager', {
      organizationId: input.organizationId,
      requestedByUserId: input.userId,
      requestedByActorType: 'user',
      requestedByActorId: input.userId,
      taskKey: `conversation:${input.conversationId}:message:${message.id}`,
      sourceType: 'agent_os_conversation',
      sourceResourceType: 'agent_conversation',
      sourceResourceId: input.conversationId,
      conversationId: input.conversationId,
      initiatedByMessageId: message.id,
      playbookKey: null,
      planStepKey: 'operator',
      displayName: 'Operator',
      payload: {
        userMessage: input.content,
        conversationId: input.conversationId,
        requestedByUserId: input.userId,
      },
    });

    const rootRequestId = requireOperatorRequestId(root);

    return { conversation, message, rootRequestId };
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

    const parsedSummary = AgentArtifactHandoffSummarySchema.safeParse(
      artifact.summary,
    );
    if (!parsedSummary.success) {
      throw new BadRequestException(
        'Selected recommendation does not define an executable handoff intent',
      );
    }

    const summary = parsedSummary.data;
    const intent = summary.handoffIntent;
    if (
      intent.targetAgentType !== 'order' ||
      intent.playbookKey !== SOURCING_MARKET_PLAYBOOK_KEY ||
      intent.planStepKey !== 'order_draft' ||
      intent.trigger !== 'user_selection' ||
      intent.requiresUserSelection !== true
    ) {
      throw new BadRequestException(
        'Selected recommendation handoff intent is not supported',
      );
    }

    const orderDraftPayload = orderDraftPayloadFromSummary(summary, artifact.id);

    const conversation = await this.repository.findConversationById({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    });
    if (!conversation) {
      throw new NotFoundException('Agent conversation not found');
    }
    if (!conversation.rootRequestId) {
      throw new BadRequestException(
        'Selected recommendation conversation has no Operator root request',
      );
    }

    const result = await this.delegation.delegate({
      organizationId: input.organizationId,
      parentAgentType: 'manager',
      agentType: intent.targetAgentType,
      conversationId: input.conversationId,
      parentRequestId: conversation.rootRequestId,
      requestedByUserId: input.userId,
      requestedByActorType: 'user',
      requestedByActorId: input.userId,
      taskKey: `conversation:${input.conversationId}:${intent.planStepKey}:artifact:${artifact.id}`,
      sourceType: 'agent_os_selection',
      sourceResourceType: 'agent_artifact',
      sourceResourceId: artifact.id,
      playbookKey: intent.playbookKey,
      planStepKey: intent.planStepKey,
      displayName: 'Order Agent',
      idempotencyKey: `handoff:${input.conversationId}:${artifact.id}:${intent.targetAgentType}:${intent.planStepKey}`,
      payload: {
        conversationId: input.conversationId,
        ...orderDraftPayload,
      },
    });

    await this.repository.createMessage({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      role: 'user',
      content: `발주 초안 생성 요청: ${artifact.title}`,
      requestId: result.requestId ?? null,
      metadata: { selectedArtifactId: artifact.id, handoffIntent: intent },
    });

    return result;
  }
}
