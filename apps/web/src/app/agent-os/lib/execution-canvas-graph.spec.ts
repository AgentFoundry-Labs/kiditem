import type { AgentRunGraph } from '@kiditem/shared/agent-os';
import { describe, expect, it } from 'vitest';
import {
  getExecutionCanvasNode,
  projectAgentRunGraph,
  toExecutionCanvasStatus,
} from './execution-canvas-graph';

const graph: AgentRunGraph = {
  conversationId: 'conversation-1',
  rootRequestId: 'request-operator-1',
  nodes: [
    {
      id: 'request-operator-1',
      parentId: null,
      kind: 'agent_task',
      label: 'Operator',
      status: 'succeeded',
      agentType: 'operator',
      capabilityKey: null,
      startedAt: '2026-06-04T00:00:00.000Z',
      finishedAt: '2026-06-04T00:00:03.000Z',
    },
    {
      id: 'request-sourcing-1',
      parentId: 'request-operator-1',
      kind: 'agent_task',
      label: 'Sourcing Agent',
      status: 'succeeded',
      agentType: 'sourcing',
      capabilityKey: null,
      startedAt: '2026-06-04T00:00:04.000Z',
      finishedAt: '2026-06-04T00:00:12.000Z',
    },
    {
      id: 'request-listing-1',
      parentId: 'request-operator-1',
      kind: 'agent_task',
      label: 'Listing Agent',
      status: 'running',
      agentType: 'listing',
      capabilityKey: null,
      startedAt: '2026-06-04T00:00:13.000Z',
      finishedAt: null,
    },
  ],
  toolInvocations: [
    {
      id: 'tool-scrape-1',
      organizationId: 'org-1',
      agentInstanceId: 'agent-sourcing-1',
      requestId: 'request-sourcing-1',
      runId: 'run-sourcing-1',
      approvalRequestId: null,
      capabilityKey: 'sourcing_scrape_url',
      status: 'succeeded',
      policyDecision: 'allowed',
      reasonCode: null,
      resourceType: 'url',
      resourceId: 'https://detail.1688.com/offer/767987154308.html',
      idempotencyKey: null,
      inputSummary: { url: 'https://detail.1688.com/offer/767987154308.html' },
      outputSummary: { title: '오프로드 장난감 자동차', imageCount: 8 },
      errorCode: null,
      errorMessage: null,
      startedAt: '2026-06-04T00:00:05.000Z',
      completedAt: '2026-06-04T00:00:09.000Z',
      createdAt: '2026-06-04T00:00:05.000Z',
    },
    {
      id: 'tool-listing-1',
      organizationId: 'org-1',
      agentInstanceId: 'agent-listing-1',
      requestId: 'request-listing-1',
      runId: 'run-listing-1',
      approvalRequestId: null,
      capabilityKey: 'listing_create_generation_package',
      status: 'running',
      policyDecision: 'allowed',
      reasonCode: null,
      resourceType: 'listing_package',
      resourceId: null,
      idempotencyKey: null,
      inputSummary: { candidateArtifactId: 'artifact-candidate-1' },
      outputSummary: null,
      errorCode: null,
      errorMessage: null,
      startedAt: '2026-06-04T00:00:14.000Z',
      completedAt: null,
      createdAt: '2026-06-04T00:00:14.000Z',
    },
    {
      id: 'tool-approval-1',
      organizationId: 'org-1',
      agentInstanceId: 'agent-channel-1',
      requestId: 'request-listing-1',
      runId: 'run-listing-1',
      approvalRequestId: 'approval-1',
      capabilityKey: 'channels_submit_coupang_listing',
      status: 'waiting_approval',
      policyDecision: 'approval_required',
      reasonCode: 'policy_approval_required',
      resourceType: 'coupang_listing',
      resourceId: null,
      idempotencyKey: 'approval-1',
      inputSummary: { productName: '오프로드 장난감 자동차' },
      outputSummary: null,
      errorCode: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: '2026-06-04T00:00:18.000Z',
    },
  ],
  artifacts: [
    {
      id: 'artifact-candidate-1',
      conversationId: 'conversation-1',
      requestId: 'request-sourcing-1',
      runId: 'run-sourcing-1',
      toolInvocationId: 'tool-scrape-1',
      artifactType: 'sourcing_candidate',
      targetDomain: 'sourcing',
      targetModel: 'SourcingCandidate',
      targetId: 'candidate-1',
      title: '1688 오프로드 장난감 후보',
      href: null,
      summary: { score: 86, source: '1688' },
      status: 'active',
      createdAt: '2026-06-04T00:00:10.000Z',
    },
    {
      id: 'artifact-listing-1',
      conversationId: 'conversation-1',
      requestId: 'request-listing-1',
      runId: 'run-listing-1',
      toolInvocationId: 'tool-listing-1',
      artifactType: 'listing_prep_package',
      targetDomain: 'listing',
      targetModel: 'ListingPrepPackage',
      targetId: 'listing-package-1',
      title: '쿠팡 등록 준비 패키지',
      href: '/listing/package/listing-package-1',
      summary: { thumbnailDrafts: 1, detailDrafts: 1 },
      status: 'active',
      createdAt: '2026-06-04T00:00:16.000Z',
    },
    {
      id: 'artifact-listing-fallback-1',
      conversationId: 'conversation-1',
      requestId: 'request-listing-1',
      runId: 'run-listing-1',
      toolInvocationId: null,
      artifactType: 'listing_review_snapshot',
      targetDomain: 'listing',
      targetModel: 'ListingReviewSnapshot',
      targetId: 'listing-review-1',
      title: '등록 검수 스냅샷',
      href: null,
      summary: { checks: 4, status: 'ready' },
      status: 'active',
      createdAt: '2026-06-04T00:00:17.000Z',
    },
  ],
};

describe('projectAgentRunGraph', () => {
  it('returns an empty canvas graph when no conversation graph is selected', () => {
    const result = projectAgentRunGraph(null);

    expect(result.lanes).toEqual([]);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.conversationId).toBeNull();
    expect(result.rootRequestId).toBeNull();
    expect(result.summary).toEqual({
      totalNodes: 0,
      runningNodes: 0,
      failedNodes: 0,
      approvalNodes: 0,
    });
  });

  it('groups task, tool, artifact, and approval nodes into agent lanes', () => {
    const result = projectAgentRunGraph(graph);

    expect(result.conversationId).toBe('conversation-1');
    expect(result.rootRequestId).toBe('request-operator-1');
    expect(result.lanes.map((lane) => lane.id)).toEqual([
      'operator',
      'sourcing',
      'listing',
    ]);
    expect(result.lanes.find((lane) => lane.id === 'sourcing')?.nodes.map((node) => node.id)).toEqual([
      'task:request-sourcing-1',
      'tool:tool-scrape-1',
      'artifact:artifact-candidate-1',
    ]);
    expect(result.lanes.find((lane) => lane.id === 'listing')?.nodes.map((node) => node.id)).toEqual([
      'task:request-listing-1',
      'tool:tool-listing-1',
      'artifact:artifact-listing-1',
      'artifact:artifact-listing-fallback-1',
      'tool:tool-approval-1',
      'approval:approval-1',
    ]);
  });

  it('creates parent, tool, artifact, and approval edges without inventing side effects', () => {
    const result = projectAgentRunGraph(graph);

    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'task:request-operator-1',
          to: 'task:request-sourcing-1',
          crossLane: true,
        }),
        expect.objectContaining({
          from: 'task:request-sourcing-1',
          to: 'tool:tool-scrape-1',
          crossLane: false,
        }),
        expect.objectContaining({
          from: 'tool:tool-scrape-1',
          to: 'artifact:artifact-candidate-1',
          crossLane: false,
        }),
        expect.objectContaining({
          from: 'tool:tool-approval-1',
          to: 'approval:approval-1',
          crossLane: false,
        }),
        expect.objectContaining({
          from: 'task:request-listing-1',
          to: 'artifact:artifact-listing-fallback-1',
          crossLane: false,
        }),
      ]),
    );
  });

  it('uses capability domains for requestless dot-form tool lanes', () => {
    const result = projectAgentRunGraph({
      ...graph,
      toolInvocations: [
        ...graph.toolInvocations,
        {
          id: 'tool-score-dot-1',
          organizationId: 'org-1',
          agentInstanceId: 'agent-sourcing-2',
          requestId: null,
          runId: null,
          approvalRequestId: null,
          capabilityKey: 'sourcing.score_opportunities',
          status: 'succeeded',
          policyDecision: 'allowed',
          reasonCode: null,
          resourceType: 'opportunity_score',
          resourceId: 'opportunity-1',
          idempotencyKey: null,
          inputSummary: { candidateId: 'candidate-1' },
          outputSummary: { score: 92 },
          errorCode: null,
          errorMessage: null,
          startedAt: '2026-06-04T00:00:19.000Z',
          completedAt: '2026-06-04T00:00:20.000Z',
          createdAt: '2026-06-04T00:00:19.000Z',
        },
        {
          id: 'tool-channel-dot-1',
          organizationId: 'org-1',
          agentInstanceId: 'agent-channel-2',
          requestId: null,
          runId: null,
          approvalRequestId: null,
          capabilityKey: 'channels.submit_coupang_listing',
          status: 'requested',
          policyDecision: 'approval_required',
          reasonCode: 'policy_approval_required',
          resourceType: 'coupang_listing',
          resourceId: null,
          idempotencyKey: null,
          inputSummary: { productName: '오프로드 장난감 자동차' },
          outputSummary: null,
          errorCode: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
          createdAt: '2026-06-04T00:00:21.000Z',
        },
      ],
    });

    expect(result.lanes.find((lane) => lane.id === 'sourcing')?.nodes.map((node) => node.id)).toContain(
      'tool:tool-score-dot-1',
    );
    expect(result.lanes.find((lane) => lane.id === 'channel_registration')?.nodes.map((node) => node.id)).toEqual([
      'tool:tool-channel-dot-1',
    ]);
  });

  it('returns the public graph, lane, and node fields expected by canvas consumers', () => {
    const result = projectAgentRunGraph(graph);
    const listingLane = result.lanes.find((lane) => lane.id === 'listing');
    const listingTask = getExecutionCanvasNode(result, 'task:request-listing-1');

    expect(Object.keys(result).sort()).toEqual([
      'conversationId',
      'edges',
      'lanes',
      'nodes',
      'rootRequestId',
      'summary',
    ].sort());
    expect(result.summary).toEqual({
      totalNodes: 10,
      runningNodes: 2,
      failedNodes: 0,
      approvalNodes: 1,
    });
    expect(Object.keys(listingLane ?? {}).sort()).toEqual([
      'agentType',
      'id',
      'label',
      'nodes',
    ].sort());
    expect(Object.keys(listingTask ?? {}).sort()).toEqual([
      'description',
      'eyebrow',
      'finishedAt',
      'id',
      'kind',
      'label',
      'laneId',
      'metadata',
      'sourceId',
      'startedAt',
      'status',
    ].sort());
    expect(listingLane).toMatchObject({
      id: 'listing',
      agentType: 'listing',
    });
    expect(listingTask).toMatchObject({
      id: 'task:request-listing-1',
      kind: 'agent',
      eyebrow: 'Listing',
      description: null,
    });
  });

  it('normalizes backend statuses into the small canvas status vocabulary', () => {
    expect(toExecutionCanvasStatus('pending')).toBe('waiting');
    expect(toExecutionCanvasStatus('claimed')).toBe('waiting');
    expect(toExecutionCanvasStatus('requested')).toBe('waiting');
    expect(toExecutionCanvasStatus('running')).toBe('running');
    expect(toExecutionCanvasStatus('active')).toBe('succeeded');
    expect(toExecutionCanvasStatus('succeeded')).toBe('succeeded');
    expect(toExecutionCanvasStatus('failed')).toBe('failed');
    expect(toExecutionCanvasStatus('waiting_approval')).toBe('waiting_approval');
    expect(toExecutionCanvasStatus('requires_approval')).toBe('waiting_approval');
    expect(toExecutionCanvasStatus('skipped')).toBe('skipped');
    expect(toExecutionCanvasStatus('cancelled')).toBe('skipped');
  });

  it('finds a node by id for right-panel detail rendering', () => {
    const result = projectAgentRunGraph(graph);

    expect(getExecutionCanvasNode(result, 'artifact:artifact-listing-1')).toMatchObject({
      kind: 'artifact',
      label: '쿠팡 등록 준비 패키지',
      status: 'succeeded',
    });
    expect(getExecutionCanvasNode(result, 'missing')).toBeNull();
    expect(getExecutionCanvasNode(result, null)).toBeNull();
  });
});
