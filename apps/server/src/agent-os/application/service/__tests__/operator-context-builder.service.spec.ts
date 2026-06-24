import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { AgentOsRepositoryPort } from '../../port/out/repository/agent-os-repository.port';
import type { AgentRunGraphService } from '../agent-run-graph.service';
import { OperatorContextBuilder } from '../operator-context-builder.service';

function makeDate(day: number): Date {
  return new Date(`2026-05-${String(day).padStart(2, '0')}T00:00:00.000Z`);
}

function makeBuilder(overrides?: {
  findConversationById?: ReturnType<typeof vi.fn>;
  findRunRequestById?: ReturnType<typeof vi.fn>;
  listMessages?: ReturnType<typeof vi.fn>;
  getConversationGraph?: ReturnType<typeof vi.fn>;
  getAgentOsLiveStatus?: ReturnType<typeof vi.fn>;
}) {
  const repository = {
    findConversationById:
      overrides?.findConversationById ??
      vi.fn().mockResolvedValue({
        id: 'conversation-1',
        organizationId: 'org-1',
        title: '실리콘 식판 소싱',
        status: 'active',
        createdByUserId: 'user-1',
        rootRequestId: 'request-operator-1',
        lastMessageAt: makeDate(30),
        metadata: {},
        createdAt: makeDate(29),
        updatedAt: makeDate(30),
      }),
    findRunRequestById:
      overrides?.findRunRequestById ??
      vi.fn().mockResolvedValue({
        id: 'request-operator-1',
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        parentRequestId: null,
        agentType: 'manager',
        status: 'claimed',
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        planStepKey: 'operator',
        displayName: 'Operator',
        payload: { userMessage: '실리콘 식판 찾아줘' },
        createdAt: makeDate(29),
      }),
    listMessages:
      overrides?.listMessages ??
      vi.fn().mockResolvedValue([
        {
          id: 'message-1',
          role: 'user',
          content: '실리콘 식판 반응 오는 신제품 찾아줘',
          createdAt: makeDate(29),
        },
        {
          id: 'message-2',
          role: 'assistant',
          content: '소싱 기준을 정리했습니다.',
          createdAt: makeDate(30),
        },
      ]),
  } as unknown as AgentOsRepositoryPort;

  const graph = {
    getConversationGraph:
      overrides?.getConversationGraph ??
      vi.fn().mockResolvedValue({
        conversationId: 'conversation-1',
        rootRequestId: 'request-operator-1',
        nodes: [
          {
            id: 'request-operator-1',
            parentId: null,
            kind: 'agent_task',
            label: 'Operator',
            status: 'claimed',
            agentType: 'manager',
            capabilityKey: null,
          },
          {
            id: 'request-sourcing-1',
            parentId: 'request-operator-1',
            kind: 'agent_task',
            label: 'Sourcing Agent',
            status: 'pending',
            agentType: 'sourcing',
            capabilityKey: null,
          },
        ],
        artifacts: [
          {
            id: 'artifact-1',
            artifactType: 'sourcing_recommendation',
            title: '실리콘 흡착 식판 후보',
            summary: { marginRate: 0.31 },
            status: 'active',
            createdAt: '2026-05-30T00:00:00.000Z',
          },
        ],
        toolInvocations: [],
      }),
  } as unknown as AgentRunGraphService;
  const liveReadiness = {
    getAgentOsLiveStatus:
      overrides?.getAgentOsLiveStatus ??
      vi.fn().mockResolvedValue({
        checks: [
          {
            key: 'openai_responses_operator',
            label: 'OpenAI Responses Operator Runtime',
            status: 'ready',
            detail: 'OpenAI Responses runtime can run with explicit model gpt-test.',
            requiredFor: ['operator_runtime'],
            remediation: null,
          },
          {
            key: 'coupang_seller_product_api',
            label: 'Coupang Seller Product API',
            status: 'missing',
            detail: 'Missing: Coupang Access Key.',
            requiredFor: ['channels.submit_coupang_listing'],
            remediation: 'Save Coupang API credentials.',
          },
        ],
        allReady: false,
        runnableCapabilities: ['operator_runtime'],
        blockedCapabilities: ['channels.submit_coupang_listing'],
      }),
  };
  const Builder = OperatorContextBuilder as new (...args: unknown[]) => OperatorContextBuilder;

  return {
    repository,
    graph,
    liveReadiness,
    builder: new Builder(repository, graph, liveReadiness),
  };
}

describe('OperatorContextBuilder', () => {
  it('builds a bounded Operator context for a conversation root request', async () => {
    const { builder, repository, graph, liveReadiness } = makeBuilder();

    const context = await builder.build({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      requestId: 'request-operator-1',
      activeUserMessage: '마진 25% 이상으로 봐줘',
    });

    expect(repository.listMessages).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      limit: 20,
    });
    expect(graph.getConversationGraph).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
    });
    expect(liveReadiness.getAgentOsLiveStatus).toHaveBeenCalledWith('org-1');
    expect(context.instructionText).toContain('strict JSON');
    expect(context.policy.allowedDecisionTypes).toEqual([
      'delegate',
      'ask_user',
      'refuse',
    ]);
    expect(context.conversation.id).toBe('conversation-1');
    expect(context.rootRequest.id).toBe('request-operator-1');
    expect(context.activeUserMessage).toBe('마진 25% 이상으로 봐줘');
    expect(context.allowedTargetAgents.map((agent) => agent.type)).toEqual([
      'sourcing',
      'listing',
      'order',
      'channel_registration',
    ]);
    const sourcingAgent = context.allowedTargetAgents.find(
      (agent) => agent.type === 'sourcing',
    );
    expect(sourcingAgent?.defaultSkillKeys).toContain('sourcing.magic_scraper');
    expect(sourcingAgent?.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'sourcing.magic_scraper',
          mode: 'development_workflow',
        }),
      ]),
    );
    expect(context.policy.allowedTargetAgentTypes).toEqual([
      'sourcing',
      'listing',
      'order',
      'channel_registration',
    ]);
    expect(context.allowedPlaybooks.map((playbook) => playbook.key)).toEqual(
      expect.arrayContaining([
        'sourcing_market_opportunity_to_order_draft_v1',
        'manual_product_intake_from_url_v1',
        'confirmed_channel_listing_registration_v1',
      ]),
    );
    expect(context.recentMessages).toHaveLength(2);
    expect(context.runGraph.nodes).toHaveLength(2);
    expect(context.capabilitySummaries.map((item) => item.key)).toContain(
      'coupang.match_products',
    );
    expect(context.liveReadiness.blockedCapabilities).toContain(
      'channels.submit_coupang_listing',
    );
  });

  it('redacts secrets and truncates oversized context fields', async () => {
    const secret = 'sk-live-abcdefghijklmnopqrstuvwxyz';
    const rawHtml = '<html>' + 'x'.repeat(2_000) + '</html>';
    const { builder } = makeBuilder({
      listMessages: vi.fn().mockResolvedValue([
        {
          id: 'message-secret',
          role: 'user',
          content: `토큰 ${secret} 로 확인해줘`,
          createdAt: makeDate(30),
        },
      ]),
      getConversationGraph: vi.fn().mockResolvedValue({
        conversationId: 'conversation-1',
        rootRequestId: 'request-operator-1',
        nodes: [],
        artifacts: [
          {
            id: 'artifact-secret',
            artifactType: 'raw_page',
            title: 'Raw scrape',
            summary: {
              accessToken: 'kiditem-access-token',
              databaseUrl: 'postgres://user:password@localhost:5432/kiditem',
              rawHtml,
            },
            status: 'active',
            createdAt: '2026-05-30T00:00:00.000Z',
          },
        ],
        toolInvocations: [],
      }),
    });

    const context = await builder.build({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      requestId: 'request-operator-1',
    });

    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('kiditem-access-token');
    expect(serialized).not.toContain('postgres://user:password');
    expect(serialized).not.toContain('x'.repeat(1_500));
    expect(serialized).toContain('[REDACTED]');
    expect(serialized).toContain('[truncated]');
  });

  it('rejects a root request that does not belong to the conversation', async () => {
    const { builder } = makeBuilder({
      findRunRequestById: vi.fn().mockResolvedValue({
        id: 'request-other',
        organizationId: 'org-1',
        conversationId: 'conversation-other',
        agentType: 'manager',
        status: 'claimed',
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        planStepKey: 'operator',
        displayName: 'Operator',
        payload: {},
        createdAt: makeDate(30),
      }),
    });

    await expect(
      builder.build({
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        requestId: 'request-other',
      }),
    ).rejects.toThrowError(NotFoundException);
  });
});
