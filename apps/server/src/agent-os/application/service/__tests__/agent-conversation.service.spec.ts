import { describe, expect, it, vi } from 'vitest';
import type { AgentRunnerPort } from '../../port/in/agent-runner.port';
import type { AgentOsRepositoryPort } from '../../port/out/repository/agent-os-repository.port';
import { AgentTaskDelegationService } from '../agent-task-delegation.service';
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

    const delegation = {
      delegate: vi.fn(),
    } as unknown as AgentTaskDelegationService;

    const service = new AgentConversationService(repository, runner, delegation);
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
        playbookKey: null,
        planStepKey: 'operator',
        displayName: 'Operator',
        payload: {
          userMessage: '실리콘 식판 반응 오는 신제품 찾아줘',
          conversationId: 'conversation-1',
          requestedByUserId: 'user-1',
        },
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

  it('stores a new user message in an existing conversation and enqueues a new Operator turn', async () => {
    const repository = {
      findConversationById: vi.fn().mockResolvedValue({
        id: 'conversation-1',
        organizationId: 'org-1',
        title: '실리콘 식판 시장 기회',
        status: 'active',
        createdByUserId: 'user-1',
        rootRequestId: 'request-operator-1',
        lastMessageAt: new Date('2026-05-29T00:00:00.000Z'),
        metadata: {},
        createdAt: new Date('2026-05-29T00:00:00.000Z'),
        updatedAt: new Date('2026-05-29T00:00:00.000Z'),
      }),
      createMessage: vi.fn().mockResolvedValue({
        id: 'message-2',
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        role: 'user',
        content: '이번에는 유아 컵까지 같이 봐줘',
        agentInstanceId: null,
        requestId: null,
        runId: null,
        metadata: {},
        createdAt: new Date('2026-05-29T00:01:00.000Z'),
      }),
      updateConversationRootRequest: vi.fn(),
    } as unknown as AgentOsRepositoryPort;

    const runner = {
      runByType: vi.fn().mockResolvedValue({
        ok: true,
        requestId: 'request-operator-2',
        agentType: 'manager',
        agentInstanceId: 'agent-operator-1',
        status: 'pending',
      }),
    } as unknown as AgentRunnerPort;

    const delegation = {
      delegate: vi.fn(),
    } as unknown as AgentTaskDelegationService;

    const service = new AgentConversationService(repository, runner, delegation);
    const result = await service.sendMessage({
      organizationId: 'org-1',
      userId: 'user-1',
      conversationId: 'conversation-1',
      content: '이번에는 유아 컵까지 같이 봐줘',
    });

    expect(repository.findConversationById).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
    });
    expect(repository.createMessage).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      role: 'user',
      content: '이번에는 유아 컵까지 같이 봐줘',
      metadata: {},
    });
    expect(runner.runByType).toHaveBeenCalledWith(
      'manager',
      expect.objectContaining({
        organizationId: 'org-1',
        requestedByUserId: 'user-1',
        taskKey: 'conversation:conversation-1:message:message-2',
        sourceType: 'agent_os_conversation',
        sourceResourceType: 'agent_conversation',
        sourceResourceId: 'conversation-1',
        conversationId: 'conversation-1',
        initiatedByMessageId: 'message-2',
        playbookKey: null,
        planStepKey: 'operator',
        displayName: 'Operator',
        payload: {
          userMessage: '이번에는 유아 컵까지 같이 봐줘',
          conversationId: 'conversation-1',
          requestedByUserId: 'user-1',
        },
      }),
    );
    expect(repository.updateConversationRootRequest).not.toHaveBeenCalled();
    expect(result.conversation.id).toBe('conversation-1');
    expect(result.message.id).toBe('message-2');
    expect(result.rootRequestId).toBe('request-operator-2');
  });

  it('enqueues Order Agent when a recommendation artifact is selected', async () => {
    const repository = {
      listArtifacts: vi.fn().mockResolvedValue([
        {
          id: 'artifact-1',
          organizationId: 'org-1',
          conversationId: 'conversation-1',
          agentInstanceId: 'agent-sourcing-1',
          requestId: 'request-sourcing-1',
          runId: 'run-sourcing-1',
          toolInvocationId: 'tool-1',
          artifactType: 'sourcing_recommendation',
          targetDomain: 'sourcing',
          targetModel: 'SourcingRecommendation',
          targetId: 'recommendation-1',
          title: '실리콘 흡착 식판 테스트 발주 후보',
          href: null,
          summary: {
            productName: '실리콘 식판 흡착형 신제품',
            supplierName: '1688 Kids Tableware Factory',
            unitPriceCny: 22.8,
            moq: 2,
            handoffIntent: {
              targetAgentType: 'order',
              playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
              planStepKey: 'order_draft',
              trigger: 'user_selection',
              requiresUserSelection: true,
              actionLabel: '발주 초안 생성',
              rationale:
                '사용자가 소싱 추천을 선택하면 Order Agent가 발주 초안을 만든다.',
            },
          },
          status: 'active',
          createdAt: new Date('2026-05-29T00:00:00.000Z'),
          updatedAt: new Date('2026-05-29T00:00:00.000Z'),
        },
      ]),
      findConversationById: vi.fn().mockResolvedValue({
        id: 'conversation-1',
        organizationId: 'org-1',
        title: '실리콘 식판 시장 기회',
        status: 'active',
        createdByUserId: 'user-1',
        rootRequestId: 'request-operator-1',
        lastMessageAt: new Date('2026-05-29T00:00:00.000Z'),
        metadata: {},
        createdAt: new Date('2026-05-29T00:00:00.000Z'),
        updatedAt: new Date('2026-05-29T00:00:00.000Z'),
      }),
      createMessage: vi.fn().mockResolvedValue({ id: 'message-selection-1' }),
    } as unknown as AgentOsRepositoryPort;

    const runner = {
      runByType: vi.fn().mockResolvedValue({
        ok: true,
        requestId: 'request-operator-1',
        agentType: 'manager',
        status: 'pending',
      }),
    } as unknown as AgentRunnerPort;

    const delegation = {
      delegate: vi.fn().mockResolvedValue({
        ok: true,
        requestId: 'request-order-1',
        agentType: 'order',
        status: 'pending',
      }),
    } as unknown as AgentTaskDelegationService;

    const service = new AgentConversationService(repository, runner, delegation);
    const result = await service.createOrderDraftFromRecommendation({
      organizationId: 'org-1',
      userId: 'user-1',
      conversationId: 'conversation-1',
      artifactId: 'artifact-1',
    });

    expect(delegation.delegate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        parentAgentType: 'manager',
        agentType: 'order',
        conversationId: 'conversation-1',
        parentRequestId: 'request-operator-1',
        requestedByUserId: 'user-1',
        requestedByActorType: 'user',
        requestedByActorId: 'user-1',
        sourceType: 'agent_os_selection',
        sourceResourceType: 'agent_artifact',
        sourceResourceId: 'artifact-1',
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        planStepKey: 'order_draft',
        displayName: 'Order Agent',
        idempotencyKey: 'handoff:conversation-1:artifact-1:order:order_draft',
        payload: expect.objectContaining({
          conversationId: 'conversation-1',
          recommendationArtifactId: 'artifact-1',
          productName: '실리콘 식판 흡착형 신제품',
          supplierName: '1688 Kids Tableware Factory',
          unitPriceCny: 22.8,
          moq: 2,
        }),
      }),
    );
    expect(runner.runByType).not.toHaveBeenCalledWith(
      'order',
      expect.anything(),
    );
    expect(repository.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-order-1',
        metadata: {
          selectedArtifactId: 'artifact-1',
          handoffIntent: expect.objectContaining({
            targetAgentType: 'order',
            planStepKey: 'order_draft',
          }),
        },
      }),
    );
    expect(result.requestId).toBe('request-order-1');
  });

  it('rejects recommendation selection without an executable handoff intent', async () => {
    const repository = {
      listArtifacts: vi.fn().mockResolvedValue([
        {
          id: 'artifact-1',
          organizationId: 'org-1',
          conversationId: 'conversation-1',
          agentInstanceId: 'agent-sourcing-1',
          requestId: 'request-sourcing-1',
          runId: 'run-sourcing-1',
          toolInvocationId: 'tool-1',
          artifactType: 'sourcing_recommendation',
          targetDomain: 'sourcing',
          targetModel: 'SourcingRecommendation',
          targetId: 'recommendation-1',
          title: '실리콘 흡착 식판 테스트 발주 후보',
          href: null,
          summary: {
            productName: '실리콘 식판 흡착형 신제품',
            supplierName: '1688 Kids Tableware Factory',
            unitPriceCny: 22.8,
            moq: 2,
          },
          status: 'active',
          createdAt: new Date('2026-05-29T00:00:00.000Z'),
          updatedAt: new Date('2026-05-29T00:00:00.000Z'),
        },
      ]),
      findConversationById: vi.fn(),
      createMessage: vi.fn(),
    } as unknown as AgentOsRepositoryPort;

    const runner = {
      runByType: vi.fn(),
    } as unknown as AgentRunnerPort;
    const delegation = {
      delegate: vi.fn(),
    } as unknown as AgentTaskDelegationService;

    const service = new AgentConversationService(repository, runner, delegation);

    await expect(
      service.createOrderDraftFromRecommendation({
        organizationId: 'org-1',
        userId: 'user-1',
        conversationId: 'conversation-1',
        artifactId: 'artifact-1',
      }),
    ).rejects.toMatchObject({
      response: {
        message:
          'Selected recommendation does not define an executable handoff intent',
      },
    });
    expect(delegation.delegate).not.toHaveBeenCalled();
  });

  it('rejects order handoff when recommendation summary is missing commercial terms', async () => {
    const repository = {
      listArtifacts: vi.fn().mockResolvedValue([
        {
          id: 'artifact-1',
          organizationId: 'org-1',
          conversationId: 'conversation-1',
          agentInstanceId: 'agent-sourcing-1',
          requestId: 'request-sourcing-1',
          runId: 'run-sourcing-1',
          toolInvocationId: 'tool-1',
          artifactType: 'sourcing_recommendation',
          targetDomain: 'sourcing',
          targetModel: 'SourcingRecommendation',
          targetId: 'recommendation-1',
          title: '실리콘 흡착 식판 테스트 발주 후보',
          href: null,
          summary: {
            productName: '실리콘 식판 흡착형 신제품',
            handoffIntent: {
              targetAgentType: 'order',
              playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
              planStepKey: 'order_draft',
              trigger: 'user_selection',
              requiresUserSelection: true,
              actionLabel: '발주 초안 생성',
              rationale:
                '사용자가 소싱 추천을 선택하면 Order Agent가 발주 초안을 만든다.',
            },
          },
          status: 'active',
          createdAt: new Date('2026-05-29T00:00:00.000Z'),
          updatedAt: new Date('2026-05-29T00:00:00.000Z'),
        },
      ]),
      findConversationById: vi.fn(),
      createMessage: vi.fn(),
    } as unknown as AgentOsRepositoryPort;

    const runner = {
      runByType: vi.fn(),
    } as unknown as AgentRunnerPort;
    const delegation = {
      delegate: vi.fn(),
    } as unknown as AgentTaskDelegationService;

    const service = new AgentConversationService(repository, runner, delegation);

    await expect(
      service.createOrderDraftFromRecommendation({
        organizationId: 'org-1',
        userId: 'user-1',
        conversationId: 'conversation-1',
        artifactId: 'artifact-1',
      }),
    ).rejects.toMatchObject({
      response: {
        message:
          'Selected recommendation is missing required order handoff fields',
      },
    });
    expect(repository.findConversationById).not.toHaveBeenCalled();
    expect(delegation.delegate).not.toHaveBeenCalled();
  });
});
