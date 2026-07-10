import { describe, expect, it } from 'vitest';
import type { AgentInstanceSummary } from '@kiditem/shared/agent-os';
import { buildAgentOfficeModel } from './agent-office-model';

function employeeInstance(
  type: string,
  id = `agent-${type}`,
  title = type,
): AgentInstanceSummary {
  return {
    id,
    organizationId: 'org-1',
    type,
    name: title,
    role: 'employee',
    title,
    icon: null,
    reportsToId: null,
    lifecycleStatus: 'active',
    pauseReason: null,
    trustLevel: 1,
    adapterType: 'hermes_local',
    modelOverride: null,
    effectiveModel: 'gpt-5.1-codex',
  };
}

describe('buildAgentOfficeModel', () => {
  it('derives office node statuses from runs, requests, and approvals', () => {
    const model = buildAgentOfficeModel({
      instances: [
        {
          id: 'agent-manager',
          organizationId: 'org-1',
          type: 'manager',
          name: 'Operator',
          role: 'orchestrator',
          title: '대표실',
          icon: null,
          reportsToId: null,
          lifecycleStatus: 'active',
          pauseReason: null,
          trustLevel: 1,
          adapterType: 'hermes_local',
          modelOverride: null,
          effectiveModel: 'gpt-5.1-codex',
        },
        {
          id: 'agent-sourcing',
          organizationId: 'org-1',
          type: 'sourcing',
          name: 'Sourcing Agent',
          role: 'specialist',
          title: '소싱 데스크',
          icon: null,
          reportsToId: 'agent-manager',
          lifecycleStatus: 'active',
          pauseReason: null,
          trustLevel: 0,
          adapterType: 'hermes_local',
          modelOverride: null,
          effectiveModel: 'gpt-5.1-codex',
        },
      ],
      runs: [
        {
          id: 'run-1',
          organizationId: 'org-1',
          agentInstanceId: 'agent-manager',
          requestId: 'request-1',
          taskKey: 'conversation:conversation-1',
          status: 'running',
          attempt: 1,
          invocationSource: 'agent_os_conversation',
          adapterType: 'hermes_local',
          model: 'gpt-5.1-codex',
          provider: 'hermes',
          startedAt: '2026-07-09T00:00:00.000Z',
          finishedAt: null,
          errorCode: null,
          errorMessage: null,
          output: null,
          costMicros: null,
        },
      ],
      requests: [
        {
          id: 'request-2',
          organizationId: 'org-1',
          agentInstanceId: 'agent-sourcing',
          agentType: 'sourcing',
          taskKey: 'conversation:conversation-1:sourcing',
          source: 'agent_os_conversation',
          sourceResourceType: null,
          sourceResourceId: null,
          sourceWorkflowRunId: null,
          status: 'requires_approval',
          priority: 5,
          attempts: 0,
          maxAttempts: 1,
          scheduledFor: '2026-07-09T00:01:00.000Z',
          claimedAt: null,
          finishedAt: null,
          latestRunId: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          createdAt: '2026-07-09T00:01:00.000Z',
        },
      ],
      approvals: [
        {
          id: 'approval-1',
          organizationId: 'org-1',
          agentInstanceId: 'agent-sourcing',
          requestId: 'request-2',
          runId: null,
          status: 'pending',
          reasonCode: 'approval_required',
          reason: '발주 전 확인',
          prompt: null,
          payload: {},
          actionSnapshot: null,
          requestedByActorType: 'agent',
          requestedByActorId: 'agent-sourcing',
          requestedByUserId: null,
          approverUserId: null,
          decidedByUserId: null,
          decidedAt: null,
          decisionReason: null,
          expiresAt: null,
          createdAt: '2026-07-09T00:02:00.000Z',
          updatedAt: '2026-07-09T00:02:00.000Z',
        },
      ],
      conversations: [],
      costEvents: [],
      authorizationEvents: [],
      totalCostMicros: '0',
    });

    expect(model.nodes.map((node) => [node.id, node.status])).toEqual([
      ['agent-manager', 'working'],
      ['agent-sourcing', 'blocked'],
    ]);
    expect(model.nodes.find((node) => node.id === 'agent-manager')).toMatchObject({
      trustLevel: 1,
      adapterType: 'hermes_local',
      effectiveModel: 'gpt-5.1-codex',
    });
    expect(model.totals).toMatchObject({
      agents: 2,
      working: 1,
      blocked: 1,
      pendingApprovals: 1,
      runningRuns: 1,
      totalCostMicros: '0',
    });
  });

  it('sorts activities with newest first', () => {
    const model = buildAgentOfficeModel({
      instances: [],
      runs: [],
      requests: [],
      approvals: [],
      conversations: [
        {
          id: 'conversation-1',
          organizationId: 'org-1',
          title: '첫 대화',
          status: 'active',
          createdByUserId: 'user-1',
          rootRequestId: null,
          lastMessageAt: '2026-07-09T00:05:00.000Z',
          createdAt: '2026-07-09T00:00:00.000Z',
          updatedAt: '2026-07-09T00:05:00.000Z',
        },
      ],
      costEvents: [
        {
          id: 'cost-1',
          organizationId: 'org-1',
          agentInstanceId: 'agent-manager',
          requestId: 'request-1',
          runId: 'run-1',
          provider: 'hermes',
          model: 'gpt-5.1-codex',
          inputTokens: 10,
          outputTokens: 4,
          cachedInputTokens: 2,
          costMicros: '1000',
          occurredAt: '2026-07-09T00:03:00.000Z',
        },
      ],
      authorizationEvents: [],
      totalCostMicros: '1000',
    });

    expect(model.activities.map((activity) => activity.id)).toEqual([
      'conversation-1',
      'cost-1',
    ]);
  });

  it('keeps presentation coordinates out of the employee business model', () => {
    const model = buildAgentOfficeModel({
      instances: [employeeInstance('manager', 'agent-manager', '운영 총괄')],
      runs: [],
      requests: [],
      approvals: [],
      conversations: [],
      costEvents: [],
      authorizationEvents: [],
      totalCostMicros: '0',
    });

    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]).not.toHaveProperty('x');
    expect(model.nodes[0]).not.toHaveProperty('y');
  });

  it('attaches capability instances to their owning employee instead of rendering them as staff nodes', () => {
    const model = buildAgentOfficeModel({
      instances: [
        {
          id: 'agent-listing',
          organizationId: 'org-1',
          type: 'listing',
          name: 'Listing Agent',
          role: 'employee',
          title: '상품 등록 담당',
          icon: null,
          reportsToId: null,
          lifecycleStatus: 'active',
          pauseReason: null,
          trustLevel: 1,
          adapterType: 'hermes_local',
          modelOverride: null,
          effectiveModel: 'gpt-5.1-codex',
        },
        {
          id: 'agent-thumbnail-analyst',
          organizationId: 'org-1',
          type: 'thumbnail_analyst',
          name: 'Thumbnail Analyst',
          role: 'capability',
          title: '썸네일 분석 능력',
          icon: null,
          reportsToId: 'agent-listing',
          lifecycleStatus: 'active',
          pauseReason: null,
          trustLevel: 0,
          adapterType: 'hermes_local',
          modelOverride: null,
          effectiveModel: 'gpt-5.1-codex',
        },
      ],
      runs: [
        {
          id: 'run-thumbnail',
          organizationId: 'org-1',
          agentInstanceId: 'agent-thumbnail-analyst',
          requestId: 'request-thumbnail',
          taskKey: 'thumbnail:review',
          status: 'running',
          attempt: 1,
          invocationSource: 'agent_os_conversation',
          adapterType: 'hermes_local',
          model: 'gpt-5.1-codex',
          provider: 'hermes',
          startedAt: '2026-07-09T00:08:00.000Z',
          finishedAt: null,
          errorCode: null,
          errorMessage: null,
          output: null,
          costMicros: null,
        },
      ],
      requests: [],
      approvals: [],
      conversations: [],
      costEvents: [],
      authorizationEvents: [],
      totalCostMicros: '0',
    });

    expect(model.nodes.map((node) => node.id)).toEqual(['agent-listing']);
    expect(model.nodes[0]).toMatchObject({
      id: 'agent-listing',
      displayName: '상품 등록 담당',
      responsibility: '상세페이지, 썸네일, 마켓 등록 초안 패키지를 만든다.',
      status: 'working',
      activeRunCount: 1,
      capabilities: [
        {
          id: 'agent-thumbnail-analyst',
          displayName: '썸네일 분석 능력',
          ownerNodeId: 'agent-listing',
          status: 'working',
          activeRunCount: 1,
        },
      ],
    });
    expect(model.capabilities.map((capability) => capability.id)).toEqual([
      'agent-thumbnail-analyst',
    ]);
    expect(model.totals).toMatchObject({
      agents: 1,
      employees: 1,
      capabilities: 1,
      working: 1,
    });
  });

  it('treats claimed requests as active work before a run starts', () => {
    const model = buildAgentOfficeModel({
      instances: [
        {
          id: 'agent-listing',
          organizationId: 'org-1',
          type: 'listing',
          name: 'Listing Agent',
          role: 'specialist',
          title: '상품 등록 담당',
          icon: null,
          reportsToId: null,
          lifecycleStatus: 'active',
          pauseReason: null,
          trustLevel: 1,
          adapterType: 'hermes_local',
          modelOverride: null,
          effectiveModel: 'gpt-5.1-codex',
        },
      ],
      runs: [],
      requests: [
        {
          id: 'request-claimed',
          organizationId: 'org-1',
          agentInstanceId: 'agent-listing',
          agentType: 'listing',
          taskKey: 'conversation:conversation-2:listing',
          source: 'agent_os_conversation',
          sourceResourceType: null,
          sourceResourceId: null,
          sourceWorkflowRunId: null,
          status: 'claimed',
          priority: 3,
          attempts: 0,
          maxAttempts: 1,
          scheduledFor: '2026-07-09T01:00:00.000Z',
          claimedAt: '2026-07-09T01:01:00.000Z',
          finishedAt: null,
          latestRunId: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          createdAt: '2026-07-09T01:00:00.000Z',
        },
        {
          id: 'request-pending',
          organizationId: 'org-1',
          agentInstanceId: 'agent-listing',
          agentType: 'listing',
          taskKey: 'conversation:conversation-2:followup',
          source: 'agent_os_conversation',
          sourceResourceType: null,
          sourceResourceId: null,
          sourceWorkflowRunId: null,
          status: 'pending',
          priority: 2,
          attempts: 0,
          maxAttempts: 1,
          scheduledFor: '2026-07-09T01:02:00.000Z',
          claimedAt: null,
          finishedAt: null,
          latestRunId: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          createdAt: '2026-07-09T01:02:00.000Z',
        },
      ],
      approvals: [],
      conversations: [],
      costEvents: [],
      authorizationEvents: [],
      totalCostMicros: '0',
    });

    expect(model.nodes).toMatchObject([
      {
        id: 'agent-listing',
        status: 'working',
        activeRunCount: 1,
      },
    ]);
    expect(model.totals).toMatchObject({
      working: 1,
      waiting: 0,
      runningRuns: 0,
    });
  });
});
