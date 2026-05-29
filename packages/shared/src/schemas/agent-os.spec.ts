import { describe, expect, it } from 'vitest';
import {
  AgentArtifactSummarySchema,
  AgentConversationSummarySchema,
  AgentInstanceLifecycleStatusSchema,
  AgentMessageSchema,
  AgentRunGraphSchema,
  AgentRunRequestStatusSchema,
  AgentRunStatusSchema,
  AgentToolInvocationSummarySchema,
  AgentToolPolicyEffectSchema,
  CreateAgentRunRequestSchema,
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
});
