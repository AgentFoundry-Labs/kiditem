import { describe, expect, it, vi } from 'vitest';
import type { AgentRunnerPort } from '../../port/in/agent-runner.port';
import type { AgentOsRepositoryPort } from '../../port/out/repository/agent-os-repository.port';
import { AgentConversationService } from '../agent-conversation.service';

describe('AgentConversationService', () => {
  it('creates a conversation, stores the user message, and enqueues Operator', async () => {
    const repository = {
      createConversation: vi.fn().mockResolvedValue({
        id: 'conversation-1',
        organizationId: 'org-1',
        title: '실리콘 식판 시장 기회',
        status: 'active',
        createdByUserId: 'user-1',
        rootRequestId: null,
        lastMessageAt: new Date('2026-05-29T00:00:00.000Z'),
        metadata: {},
        createdAt: new Date('2026-05-29T00:00:00.000Z'),
        updatedAt: new Date('2026-05-29T00:00:00.000Z'),
      }),
      createMessage: vi.fn().mockResolvedValue({
        id: 'message-1',
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        role: 'user',
        content: '실리콘 식판 반응 오는 신제품 찾아줘',
        agentInstanceId: null,
        requestId: null,
        runId: null,
        metadata: {},
        createdAt: new Date('2026-05-29T00:00:00.000Z'),
      }),
      updateConversationRootRequest: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentOsRepositoryPort;

    const runner = {
      runByType: vi.fn().mockResolvedValue({
        ok: true,
        requestId: 'request-operator-1',
        agentType: 'manager',
        agentInstanceId: 'agent-operator-1',
        status: 'pending',
      }),
    } as unknown as AgentRunnerPort;

    const service = new AgentConversationService(repository, runner);
    const result = await service.startConversation({
      organizationId: 'org-1',
      userId: 'user-1',
      content: '실리콘 식판 반응 오는 신제품 찾아줘',
    });

    expect(repository.createConversation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      title: '실리콘 식판 반응 오는 신제품 찾아줘',
      createdByUserId: 'user-1',
      metadata: { surface: 'agent_os' },
    });
    expect(runner.runByType).toHaveBeenCalledWith(
      'manager',
      expect.objectContaining({
        organizationId: 'org-1',
        requestedByUserId: 'user-1',
        sourceType: 'agent_os_conversation',
        sourceResourceType: 'agent_conversation',
        sourceResourceId: 'conversation-1',
        conversationId: 'conversation-1',
        initiatedByMessageId: 'message-1',
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        planStepKey: 'operator',
        displayName: 'Operator',
        payload: expect.objectContaining({
          playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
          userMessage: '실리콘 식판 반응 오는 신제품 찾아줘',
          conversationId: 'conversation-1',
        }),
      }),
    );
    expect(repository.updateConversationRootRequest).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      rootRequestId: 'request-operator-1',
    });
    expect(result.conversation.id).toBe('conversation-1');
    expect(result.rootRequestId).toBe('request-operator-1');
  });
});
