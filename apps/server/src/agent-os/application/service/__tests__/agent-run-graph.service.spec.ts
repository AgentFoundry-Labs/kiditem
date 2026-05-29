import { describe, expect, it } from 'vitest';
import type { AgentOsRepositoryPort } from '../../port/out/repository/agent-os-repository.port';
import { AgentRunGraphService } from '../agent-run-graph.service';

function repositoryStub(): AgentOsRepositoryPort {
  return {
    findConversationById: async () => ({
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
    listRunRequests: async () => [
      {
        id: 'request-operator-1',
        organizationId: 'org-1',
        agentInstanceId: 'agent-operator-1',
        taskSessionId: 'session-1',
        taskKey: 'conversation:conversation-1',
        agentType: 'manager',
        adapterType: 'openai_responses',
        latestRunId: 'run-operator-1',
        source: 'agent_os_conversation',
        triggerDetail: null,
        reason: null,
        idempotencyKey: null,
        priority: 0,
        sourceWorkflowRunId: null,
        sourceWorkflowNodeId: null,
        sourceResourceType: 'agent_conversation',
        sourceResourceId: 'conversation-1',
        requestedByUserId: 'user-1',
        requestedByActorType: 'user',
        requestedByActorId: 'user-1',
        payload: {},
        status: 'succeeded',
        scheduledFor: new Date('2026-05-29T00:00:00.000Z'),
        claimedAt: new Date('2026-05-29T00:00:00.100Z'),
        claimedBy: 'worker-1',
        attempts: 1,
        maxAttempts: 3,
        finishedAt: new Date('2026-05-29T00:00:01.000Z'),
        coalescedIntoRequestId: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        createdAt: new Date('2026-05-29T00:00:00.000Z'),
        updatedAt: new Date('2026-05-29T00:00:01.000Z'),
        conversationId: 'conversation-1',
        initiatedByMessageId: 'message-1',
        parentRequestId: null,
        delegatedByRunId: null,
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        planStepKey: 'operator',
        displayName: 'Operator',
        statusReason: null,
        dependencyKeys: [],
      },
    ],
    listToolInvocations: async () => [
      {
        id: 'tool-1',
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        agentInstanceId: 'agent-sourcing-1',
        requestId: 'request-sourcing-1',
        runId: 'run-sourcing-1',
        approvalRequestId: null,
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
        startedAt: new Date('2026-05-29T00:00:00.000Z'),
        completedAt: new Date('2026-05-29T00:00:01.000Z'),
        createdAt: new Date('2026-05-29T00:00:00.000Z'),
      },
    ],
    listArtifacts: async () => [
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
        summary: { action: 'test_order', score: 84 },
        status: 'active',
        createdAt: new Date('2026-05-29T00:00:01.000Z'),
        updatedAt: new Date('2026-05-29T00:00:01.000Z'),
      },
    ],
  } as unknown as AgentOsRepositoryPort;
}

describe('AgentRunGraphService', () => {
  it('projects conversation task tree, tool invocations, and artifacts', async () => {
    const service = new AgentRunGraphService(repositoryStub());

    const graph = await service.getConversationGraph({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
    });

    expect(graph.rootRequestId).toBe('request-operator-1');
    expect(graph.nodes).toEqual([
      expect.objectContaining({
        id: 'request-operator-1',
        kind: 'agent_task',
        label: 'Operator',
        status: 'succeeded',
      }),
    ]);
    expect(graph.toolInvocations[0].capabilityKey).toBe(
      'sourcing.score_opportunities',
    );
    expect(graph.artifacts[0].artifactType).toBe('sourcing_recommendation');
  });
});
