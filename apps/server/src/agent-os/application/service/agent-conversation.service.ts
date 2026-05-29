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
}
