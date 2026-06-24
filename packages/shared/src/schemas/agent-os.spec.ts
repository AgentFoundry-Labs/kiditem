import { describe, expect, it } from 'vitest';
import {
  AgentArtifactHandoffSummarySchema,
  AgentArtifactSummarySchema,
  AgentApprovalRequestSummarySchema,
  AgentConversationSummarySchema,
  AgentDefinitionSummarySchema,
  AgentSkillSummarySchema,
  AgentHandoffIntentSchema,
  AgentInstanceLifecycleStatusSchema,
  AgentMessageSchema,
  AgentRunGraphSchema,
  AgentRunRequestStatusSchema,
  AgentRunStatusSchema,
  AgentInstanceToolPolicySummarySchema,
  AgentToolInvocationSummarySchema,
  AgentToolPolicyEffectSchema,
  CreateAgentRunRequestSchema,
  OperatorDecisionSchema,
  ResolveAgentApprovalSchema,
  SendAgentMessageSchema,
} from './agent-os';

describe('agent-os schemas', () => {
  it('defaults taskKey to default at the API boundary', () => {
    const parsed = CreateAgentRunRequestSchema.parse({
      agentType: 'listing-writer',
      sourceType: 'manual',
    });

    expect(parsed.taskKey).toBe('default');
    expect(parsed.priority).toBe(0);
    expect(parsed.payload).toEqual({});
    expect(parsed.dryRun).toBe(false);
  });

  it('rejects empty agent type', () => {
    expect(() =>
      CreateAgentRunRequestSchema.parse({ agentType: '', sourceType: 'manual' }),
    ).toThrow();
  });

  it('does not allow queued as a run status', () => {
    expect(() => AgentRunStatusSchema.parse('queued')).toThrow();
    expect(AgentRunStatusSchema.parse('running')).toBe('running');
  });

  it('keeps queue status names on AgentRunRequest', () => {
    expect(AgentRunRequestStatusSchema.parse('pending')).toBe('pending');
    expect(AgentRunRequestStatusSchema.parse('claimed')).toBe('claimed');
    expect(AgentRunRequestStatusSchema.parse('coalesced')).toBe('coalesced');
    expect(AgentRunRequestStatusSchema.parse('requires_approval')).toBe(
      'requires_approval',
    );
    expect(() => AgentRunRequestStatusSchema.parse('running')).toThrow();
  });

  it('accepts the three lifecycle states', () => {
    expect(AgentInstanceLifecycleStatusSchema.parse('active')).toBe('active');
    expect(AgentInstanceLifecycleStatusSchema.parse('paused')).toBe('paused');
    expect(AgentInstanceLifecycleStatusSchema.parse('disabled')).toBe(
      'disabled',
    );
    expect(() => AgentInstanceLifecycleStatusSchema.parse('idle')).toThrow();
  });

  it('captures three tool policy effects', () => {
    expect(AgentToolPolicyEffectSchema.parse('allow')).toBe('allow');
    expect(AgentToolPolicyEffectSchema.parse('deny')).toBe('deny');
    expect(AgentToolPolicyEffectSchema.parse('approval_required')).toBe(
      'approval_required',
    );
  });

  it('parses effective instance tool policy summaries', () => {
    const policy = AgentInstanceToolPolicySummarySchema.parse({
      toolKey: 'channels.register_confirmed_listing',
      effect: 'approval_required',
      source: 'instance',
      approvalMode: 'admin',
      dryRunMode: 'disabled',
      constraints: { maxListings: 3 },
    });

    expect(policy).toEqual({
      toolKey: 'channels.register_confirmed_listing',
      effect: 'approval_required',
      source: 'instance',
      approvalMode: 'admin',
      dryRunMode: 'disabled',
      constraints: { maxListings: 3 },
    });
    expect(() =>
      AgentInstanceToolPolicySummarySchema.parse({
        ...policy,
        source: 'global',
      }),
    ).toThrow();
  });

  it('parses Agent definitions with default skill keys and skill summaries', () => {
    const definition = AgentDefinitionSummarySchema.parse({
      id: 'sourcing',
      type: 'sourcing',
      name: 'Sourcing',
      description: '소싱 URL 스크래핑/상품 수집 tool-wrapper.',
      promptPath: 'agent-config/prompts/agents/sourcing.md',
      defaultAdapterType: 'claude_local',
      defaultModelEnv: 'AGENT_SOURCING_MODEL',
      defaultRuntimeConfig: {},
      defaultCapabilities: {},
      defaultSkillKeys: ['sourcing.magic_scraper'],
      runtimeKind: 'tool_wrapper',
      delegationRole: 'leaf',
      catalogStatus: 'active',
      marketplaceId: null,
    });
    expect(definition.defaultSkillKeys).toEqual(['sourcing.magic_scraper']);

    const skill = AgentSkillSummarySchema.parse({
      key: 'sourcing.magic_scraper',
      name: 'Magic Scraper',
      description: 'Develop Sourcing extractors from CDP page evidence.',
      category: 'sourcing',
      version: '1.0.0',
      skillPath: 'tools/codex/skills/magic-scraper/SKILL.md',
      defaultPreload: true,
      allowedAgentTypes: ['sourcing'],
      mode: 'development_workflow',
    });
    expect(skill.allowedAgentTypes).toEqual(['sourcing']);
    expect(() =>
      AgentSkillSummarySchema.parse({ ...skill, mode: 'production_runtime' }),
    ).toThrow();
  });

  it('parses Agent OS conversation and message summaries', () => {
    const conversation = AgentConversationSummarySchema.parse({
      id: 'conversation-1',
      organizationId: 'org-1',
      title: '실리콘 식판 시장 기회 찾기',
      status: 'active',
      createdByUserId: 'user-1',
      rootRequestId: 'request-operator-1',
      lastMessageAt: '2026-05-29T00:00:00.000Z',
      createdAt: '2026-05-29T00:00:00.000Z',
      updatedAt: '2026-05-29T00:00:00.000Z',
    });
    expect(conversation.status).toBe('active');

    const message = AgentMessageSchema.parse({
      id: 'message-1',
      conversationId: 'conversation-1',
      role: 'user',
      content: '실리콘 식판 카테고리에서 반응 오는 신제품 찾아줘',
      agentInstanceId: null,
      requestId: 'request-operator-1',
      runId: null,
      metadata: {},
      createdAt: '2026-05-29T00:00:00.000Z',
    });
    expect(message.role).toBe('user');

    expect(() => SendAgentMessageSchema.parse({ content: '' })).toThrow();
  });

  it('parses approval resolution requests', () => {
    expect(
      ResolveAgentApprovalSchema.parse({
        status: 'approved',
        decisionReason: '테스트 발주 범위라 승인합니다.',
      }),
    ).toEqual({
      status: 'approved',
      decisionReason: '테스트 발주 범위라 승인합니다.',
    });
    expect(ResolveAgentApprovalSchema.parse({ status: 'rejected' })).toEqual({
      status: 'rejected',
    });

    expect(() =>
      ResolveAgentApprovalSchema.parse({ status: 'pending' }),
    ).toThrow();
  });

  it('parses approval request summaries for audit history', () => {
    const approval = AgentApprovalRequestSummarySchema.parse({
      id: 'approval-1',
      organizationId: 'org-1',
      agentInstanceId: 'agent-order-1',
      requestId: 'request-order-1',
      runId: 'run-order-1',
      status: 'approved',
      reasonCode: 'policy_approval_required',
      reason: 'Human approval required.',
      prompt: '쿠팡 등록을 진행할까요?',
      payload: { productName: '실리콘 흡착 식판' },
      actionSnapshot: { capabilityKey: 'channels.register_confirmed_listing' },
      requestedByActorType: 'agent',
      requestedByActorId: 'agent-sourcing-1',
      requestedByUserId: null,
      approverUserId: null,
      decidedByUserId: 'user-1',
      decidedAt: '2026-05-29T00:05:00.000Z',
      decisionReason: '테스트 등록 범위라 승인합니다.',
      expiresAt: null,
      createdAt: '2026-05-29T00:04:00.000Z',
      updatedAt: '2026-05-29T00:05:00.000Z',
    });

    expect(approval.status).toBe('approved');
    expect(approval.actionSnapshot?.capabilityKey).toBe(
      'channels.register_confirmed_listing',
    );
  });

  it('parses tool invocation, artifact, and graph summaries', () => {
    const invocation = AgentToolInvocationSummarySchema.parse({
      id: 'tool-1',
      organizationId: 'org-1',
      agentInstanceId: 'agent-sourcing-1',
      requestId: 'request-sourcing-1',
      runId: 'run-sourcing-1',
      approvalRequestId: 'approval-1',
      capabilityKey: 'sourcing.score_opportunities',
      status: 'succeeded',
      policyDecision: 'allowed',
      reasonCode: 'policy_allow',
      resourceType: 'sourcing_recommendation',
      resourceId: 'recommendation-1',
      idempotencyKey: 'score-key-1',
      inputSummary: { candidates: 2 },
      outputSummary: { recommendations: 1 },
      errorCode: null,
      errorMessage: null,
      startedAt: '2026-05-29T00:00:00.000Z',
      completedAt: '2026-05-29T00:00:01.000Z',
      createdAt: '2026-05-29T00:00:00.000Z',
    });
    expect(invocation.capabilityKey).toBe('sourcing.score_opportunities');
    expect(invocation.approvalRequestId).toBe('approval-1');

    const artifact = AgentArtifactSummarySchema.parse({
      id: 'artifact-1',
      conversationId: 'conversation-1',
      requestId: 'request-sourcing-1',
      runId: 'run-sourcing-1',
      toolInvocationId: 'tool-1',
      artifactType: 'sourcing_recommendation',
      targetDomain: 'sourcing',
      targetModel: 'SourcingRecommendation',
      targetId: 'recommendation-1',
      title: '실리콘 흡착 식판 테스트 발주 후보',
      href: null,
      summary: { action: 'test_order', score: 84 },
      status: 'active',
      createdAt: '2026-05-29T00:00:01.000Z',
    });
    expect(artifact.summary.score).toBe(84);

    const graph = AgentRunGraphSchema.parse({
      conversationId: 'conversation-1',
      rootRequestId: 'request-operator-1',
      nodes: [
        {
          id: 'request-operator-1',
          parentId: null,
          kind: 'agent_task',
          label: 'Operator',
          status: 'succeeded',
          agentType: 'manager',
          capabilityKey: null,
          startedAt: '2026-05-29T00:00:00.000Z',
          finishedAt: '2026-05-29T00:00:01.000Z',
        },
      ],
      artifacts: [artifact],
      toolInvocations: [invocation],
    });
    expect(graph.nodes[0].kind).toBe('agent_task');
  });

  it('parses delegate, ask_user, and refuse Operator decisions', () => {
    const delegate = OperatorDecisionSchema.parse({
      decisionType: 'delegate',
      targetAgentType: 'sourcing',
      playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
      taskInput: { keyword: '실리콘 식판' },
      userVisibleRationale: '소싱 에이전트가 시장 신호를 수집해야 합니다.',
    });
    expect(delegate.decisionType).toBe('delegate');
    if (delegate.decisionType !== 'delegate') {
      throw new Error('Expected delegate decision');
    }
    expect(delegate.targetAgentType).toBe('sourcing');

    const manualUrlDelegate = OperatorDecisionSchema.parse({
      decisionType: 'delegate',
      targetAgentType: 'sourcing',
      playbookKey: 'manual_product_intake_from_url_v1',
      taskInput: { sourceUrl: 'https://detail.1688.com/offer/123.html' },
      userVisibleRationale: '제공된 URL을 소싱 에이전트가 먼저 수집해야 합니다.',
    });
    if (manualUrlDelegate.decisionType !== 'delegate') {
      throw new Error('Expected manual URL delegate decision');
    }
    expect(manualUrlDelegate.taskInput).toEqual({
      sourceUrl: 'https://detail.1688.com/offer/123.html',
    });

    const listingDelegate = OperatorDecisionSchema.parse({
      decisionType: 'delegate',
      targetAgentType: 'listing',
      playbookKey: 'manual_product_intake_from_url_v1',
      taskInput: {
        productName: '무선 RC카',
        imageUrls: ['https://cdn.example.com/car.jpg'],
      },
      userVisibleRationale: '소싱 후보를 상세페이지와 썸네일 초안으로 준비해야 합니다.',
    });
    if (listingDelegate.decisionType !== 'delegate') {
      throw new Error('Expected listing delegate decision');
    }
    expect(listingDelegate.targetAgentType).toBe('listing');

    const channelRegistrationDelegate = OperatorDecisionSchema.parse({
      decisionType: 'delegate',
      targetAgentType: 'channel_registration',
      playbookKey: 'confirmed_channel_listing_registration_v1',
      taskInput: {
        masterId: '00000000-0000-4000-8000-000000000001',
        channelAccountId: '00000000-0000-4000-8000-000000000002',
        externalId: 'COUPANG-720445',
      },
      userVisibleRationale: '확인된 마켓 등록상품 ID를 KidItem에 연결해야 합니다.',
    });
    if (channelRegistrationDelegate.decisionType !== 'delegate') {
      throw new Error('Expected channel registration delegate decision');
    }
    expect(channelRegistrationDelegate.targetAgentType).toBe('channel_registration');

    const askUser = OperatorDecisionSchema.parse({
      decisionType: 'ask_user',
      question: '어떤 카테고리에서 먼저 찾을까요?',
      reason: '카테고리가 없으면 검색 범위가 너무 넓습니다.',
    });
    expect(askUser.decisionType).toBe('ask_user');

    const refuse = OperatorDecisionSchema.parse({
      decisionType: 'refuse',
      reason: '외부 주문 제출은 승인 없는 자동 실행 범위가 아닙니다.',
    });
    expect(refuse.decisionType).toBe('refuse');
  });

  it('parses Agent OS artifact handoff intent summaries', () => {
    const validHandoff = {
      targetAgentType: 'order',
      playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
      planStepKey: 'order_draft',
      trigger: 'user_selection',
      requiresUserSelection: true,
      actionLabel: '발주 초안 생성',
      rationale: '사용자가 소싱 추천을 선택하면 Order Agent가 발주 초안을 만든다.',
    } as const;

    const handoff = AgentHandoffIntentSchema.parse(validHandoff);

    expect(handoff.targetAgentType).toBe('order');

    const summary = AgentArtifactHandoffSummarySchema.parse({
      productName: '실리콘 식판 흡착형 신제품',
      handoffIntent: handoff,
    });

    expect(summary.handoffIntent.planStepKey).toBe('order_draft');
    expect(summary.productName).toBe('실리콘 식판 흡착형 신제품');

    expect(() =>
      AgentHandoffIntentSchema.parse({
        targetAgentType: 'inventory',
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        planStepKey: 'order_draft',
        trigger: 'user_selection',
        requiresUserSelection: true,
        actionLabel: '재고 확인',
        rationale: '지원하지 않는 agent target이다.',
      }),
    ).toThrow();

    expect(() =>
      AgentHandoffIntentSchema.parse({
        ...validHandoff,
        requiresUserSelection: false,
      }),
    ).toThrow();

    expect(() =>
      AgentHandoffIntentSchema.parse({
        ...validHandoff,
        unexpected: true,
      }),
    ).toThrow();
  });

  it('rejects malformed Operator decisions', () => {
    expect(() =>
      OperatorDecisionSchema.parse({
        decisionType: 'delegate',
        targetAgentType: 'inventory',
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        taskInput: { keyword: '실리콘 식판' },
        userVisibleRationale: '재고 에이전트에게 넘깁니다.',
      }),
    ).toThrow();

    expect(() =>
      OperatorDecisionSchema.parse({
        decisionType: 'delegate',
        targetAgentType: 'sourcing',
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        taskInput: {},
        userVisibleRationale: '소싱 에이전트에게 넘깁니다.',
      }),
    ).toThrow();

    expect(() =>
      OperatorDecisionSchema.parse({
        decisionType: 'ask_user',
        question: '',
        reason: '질문은 비어 있을 수 없습니다.',
      }),
    ).toThrow();

    expect(() =>
      OperatorDecisionSchema.parse({
        decisionType: 'refuse',
        reason: '',
      }),
    ).toThrow();

    expect(() =>
      OperatorDecisionSchema.parse({
        decisionType: 'delegate',
        targetAgentType: 'sourcing',
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        taskInput: { keyword: '실리콘 식판' },
        userVisibleRationale: '소싱 에이전트에게 넘깁니다.',
        capabilityKey: 'supply.submit_purchase_order',
      }),
    ).toThrow();
  });
});
