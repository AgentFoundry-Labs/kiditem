import { Inject, Injectable } from '@nestjs/common';
import { AgentOsBoundaryError } from '../../domain/agent-os.errors';
import type { AgentConversationRecord } from '../../domain/agent-os.types';
import {
  type AgentInteractionInput,
  type AgentInteractionPort,
  type AgentInteractionResult,
  type RecordAgentAssistantMessageInput,
} from '../port/in/legacy-run/agent-interaction.port';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../port/in/agent-runner.port';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../port/out/repository/agent-os-repository.port';

function titleFromContent(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  return compact.length > 40 ? `${compact.slice(0, 40)}...` : compact;
}

function requiredId(value: string | undefined, code: string): string {
  if (value?.trim()) return value;
  throw new AgentOsBoundaryError(code, `Agent interaction is missing ${code}.`);
}

function isAccessibleConversation(
  conversation: AgentConversationRecord | null,
  input: Pick<
    AgentInteractionInput,
    'organizationId' | 'userId' | 'surface' | 'agentType'
  >,
): conversation is AgentConversationRecord {
  return Boolean(
    conversation &&
      conversation.organizationId === input.organizationId &&
      conversation.status === 'active' &&
      conversation.createdByUserId === input.userId &&
      conversation.metadata.surface === input.surface &&
      conversation.metadata.agentType === input.agentType,
  );
}

@Injectable()
export class AgentInteractionService implements AgentInteractionPort {
  constructor(
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
    @Inject(AGENT_RUNNER_PORT)
    private readonly runner: AgentRunnerPort,
  ) {}

  async interact(input: AgentInteractionInput): Promise<AgentInteractionResult> {
    const conversation = input.conversationId
      ? await this.requireConversation(input, input.conversationId)
      : await this.repository.createConversation({
          organizationId: input.organizationId,
          title: titleFromContent(input.content),
          createdByUserId: input.userId,
          metadata: { surface: input.surface, agentType: input.agentType },
        });
    const conversationId = requiredId(
      conversation.id,
      'conversation_id_missing',
    );

    const userMessage = await this.repository.createMessage({
      organizationId: input.organizationId,
      conversationId,
      role: 'user',
      content: input.content,
      metadata: { surface: input.surface },
    });
    const userMessageId = requiredId(userMessage.id, 'message_id_missing');

    const queued = await this.runner.runByType(input.agentType, {
      organizationId: input.organizationId,
      requestedByUserId: input.userId,
      requestedByActorType: 'user',
      requestedByActorId: input.userId,
      taskKey: `conversation:${conversationId}:message:${userMessageId}`,
      sourceType: input.surface,
      sourceResourceType: input.sourceResourceType,
      sourceResourceId: input.sourceResourceId,
      conversationId,
      initiatedByMessageId: userMessageId,
      playbookKey: 'sourcing_workspace_question_v1',
      planStepKey: 'sourcing_agent',
      displayName: 'Sourcing Agent',
      maxAttempts: input.maxAttempts,
      payload: {
        ...input.payload,
        action: 'workspace_question',
        userMessage: input.content,
      },
    });
    const requestId = requiredId(queued.requestId, 'request_id_missing');

    if (!conversation.rootRequestId) {
      await this.repository.updateConversationRootRequest({
        organizationId: input.organizationId,
        conversationId,
        rootRequestId: requestId,
      });
    }

    if (!this.runner.executeRequest) {
      throw new AgentOsBoundaryError(
        'inline_executor_missing',
        'Agent interaction requires inline execution.',
      );
    }
    await this.runner.executeRequest({
      organizationId: input.organizationId,
      requestId,
      workerId: 'sourcing-dashboard-inline',
    });

    const request = await this.repository.findRunRequestById({
      organizationId: input.organizationId,
      requestId,
    });
    if (!request) {
      throw new AgentOsBoundaryError(
        'request_not_found',
        'Agent interaction request was not found after execution.',
      );
    }
    const run = await this.repository.findRunByRequestId({
      organizationId: input.organizationId,
      requestId,
    });

    if (request.status === 'succeeded' && run?.status === 'succeeded') {
      const text = typeof run.output?.text === 'string' ? run.output.text.trim() : '';
      if (!text) {
        throw new AgentOsBoundaryError(
          'assistant_output_missing',
          'Successful interaction requires assistant output text.',
        );
      }
      await this.repository.createMessage({
        organizationId: input.organizationId,
        conversationId,
        role: 'assistant',
        agentInstanceId: run.agentInstanceId,
        requestId,
        runId: run.id,
        content: text,
        metadata: { surface: input.surface },
      });
    }

    const status =
      request.status === 'cancelled'
        ? 'cancelled'
        : request.status === 'succeeded'
          ? 'succeeded'
          : 'failed';
    const provider =
      run?.provider === 'claude_cli' || run?.provider === 'codex_cli'
        ? run.provider
        : null;
    return {
      conversationId,
      requestId,
      runId: run?.id ?? null,
      status,
      provider,
      model: run?.model ?? null,
      output: run?.output ?? null,
      errorCode: request.lastErrorCode ?? run?.errorCode ?? null,
    };
  }

  async recordAssistantMessage(
    input: RecordAgentAssistantMessageInput,
  ): Promise<void> {
    await this.repository.createMessage({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      role: 'assistant',
      requestId: input.requestId,
      runId: input.runId,
      content: input.content,
      metadata: input.metadata,
    });
  }

  private async requireConversation(
    input: AgentInteractionInput,
    conversationId: string,
  ): Promise<AgentConversationRecord> {
    const conversation = await this.repository.findConversationById({
      organizationId: input.organizationId,
      conversationId,
    });
    if (!isAccessibleConversation(conversation, input)) {
      throw new AgentOsBoundaryError(
        'conversation_not_accessible',
        'The conversation is not accessible for this sourcing interaction.',
      );
    }
    return conversation;
  }
}
