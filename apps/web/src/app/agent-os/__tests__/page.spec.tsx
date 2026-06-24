import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('@/components/panel/hooks/usePanelStream', () => ({
  usePanelStream: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>(
    '@/lib/api-client',
  );
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      get: (path: string) => getMock(path),
      post: (path: string, body?: unknown) => postMock(path, body),
    },
  };
});

import AgentOsPage from '../page';

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <AgentOsPage />
    </QueryClientProvider>,
  );
}

const managerDefinition = {
  id: 'definition-manager',
  type: 'manager',
  name: 'Manager Agent',
  description: null,
  promptPath: 'agents/manager.md',
  defaultAdapterType: 'operator',
  defaultModelEnv: 'OPENAI_MODEL',
  defaultRuntimeConfig: {},
  defaultCapabilities: {},
  runtimeKind: 'coordinator',
  catalogStatus: 'active',
  marketplaceId: null,
};

const sourcingDefinition = {
  ...managerDefinition,
  id: 'definition-sourcing',
  type: 'sourcing',
  name: 'Sourcing Agent',
  promptPath: 'agents/sourcing.md',
  runtimeKind: 'agent',
};

const toolDefinition = {
  ...managerDefinition,
  id: 'definition-sourcing-tool',
  type: 'sourcing_tool',
  name: 'Sourcing Tool',
  promptPath: 'tools/sourcing.md',
  runtimeKind: 'tool_wrapper',
};

const managerInstance = {
  id: 'agent-manager-1',
  organizationId: 'org-1',
  type: 'manager',
  name: 'Manager Agent',
  role: 'ceo',
  title: 'Operation Manager',
  icon: null,
  reportsToId: null,
  lifecycleStatus: 'active',
  pauseReason: null,
  trustLevel: 5,
  adapterType: 'operator',
  modelOverride: null,
  effectiveModel: 'gpt-5.4',
};

const sourcingInstance = {
  ...managerInstance,
  id: 'agent-sourcing-1',
  type: 'sourcing',
  name: 'Sourcing',
  role: 'sourcing',
  title: '소싱',
  reportsToId: 'agent-manager-1',
  adapterType: 'openai',
};

const sourcingToolInstance = {
  ...managerInstance,
  id: 'tool-sourcing-1',
  type: 'sourcing_tool',
  name: '1688 Match Tool',
  role: 'sourcing',
  title: '1688 매칭',
  reportsToId: 'agent-manager-1',
  adapterType: 'tool',
};

const runningRun = {
  id: 'run-sourcing-1',
  organizationId: 'org-1',
  requestId: 'request-sourcing-1',
  agentInstanceId: 'agent-sourcing-1',
  agentType: 'sourcing',
  taskKey: 'sourcing.rank_candidates',
  status: 'running',
  attempt: 1,
  invocationSource: 'agent_os',
  adapterType: 'openai',
  model: 'gpt-5.4',
  provider: 'openai',
  startedAt: '2026-05-29T00:00:00.000Z',
  finishedAt: null,
  errorCode: null,
  errorMessage: null,
};

const actionTask = {
  id: 'task-1',
  organizationId: 'org-1',
  taskKey: 'sourcing.review_candidate',
  type: 'ai',
  label: '소싱 후보 검토',
  detail: null,
  where: null,
  href: null,
  priority: 'urgent',
  status: 'pending',
  role: 'sourcing',
  apiCall: null,
  result: null,
  notes: [],
  activityLog: [
    {
      action: 'created',
      timestamp: '2026-05-29T00:00:00.000Z',
      detail: '소싱 후보 검토 요청',
      success: true,
    },
  ],
  date: '2026-05-29',
  relatedProducts: [],
  assigneeUserId: null,
  assigneeUser: null,
  sourceAlert: null,
  createdAt: '2026-05-29T00:00:00.000Z',
  updatedAt: '2026-05-29T00:00:00.000Z',
};

const conversation = {
  id: 'conversation-1',
  organizationId: 'org-1',
  title: '실리콘 식판 시장 기회',
  status: 'active',
  createdByUserId: 'user-1',
  rootRequestId: 'request-operator-1',
  lastMessageAt: '2026-05-29T00:02:00.000Z',
  createdAt: '2026-05-29T00:00:00.000Z',
  updatedAt: '2026-05-29T00:02:00.000Z',
};

const message = {
  id: 'message-1',
  conversationId: 'conversation-1',
  role: 'user',
  content: '실리콘 식판 반응 오는 신제품 찾아줘',
  agentInstanceId: null,
  requestId: 'request-operator-1',
  runId: null,
  metadata: {},
  createdAt: '2026-05-29T00:00:00.000Z',
};

const conversationGraph = {
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
      startedAt: '2026-05-29T00:00:00.000Z',
      finishedAt: '2026-05-29T00:00:05.000Z',
    },
    {
      id: 'request-sourcing-1',
      parentId: 'request-operator-1',
      kind: 'agent_task',
      label: 'Sourcing Agent',
      status: 'succeeded',
      agentType: 'sourcing',
      capabilityKey: null,
      startedAt: '2026-05-29T00:00:06.000Z',
      finishedAt: '2026-05-29T00:01:00.000Z',
    },
    {
      id: 'request-listing-1',
      parentId: 'request-operator-1',
      kind: 'agent_task',
      label: 'Listing Agent',
      status: 'running',
      agentType: 'listing',
      capabilityKey: null,
      startedAt: '2026-05-29T00:01:05.000Z',
      finishedAt: null,
    },
  ],
  artifacts: [
    {
      id: 'artifact-1',
      conversationId: 'conversation-1',
      requestId: 'request-sourcing-1',
      runId: 'run-sourcing-1',
      toolInvocationId: null,
      artifactType: 'sourcing_recommendation',
      targetDomain: 'sourcing',
      targetModel: 'SourcingRecommendation',
      targetId: 'recommendation-1',
      title: '실리콘 흡착 식판 테스트 발주 후보',
      href: null,
      summary: { score: 82, action: 'test_order', reason: '반응 신호가 좋습니다.' },
      status: 'active',
      createdAt: '2026-05-29T00:02:00.000Z',
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
      href: null,
      summary: { thumbnailDrafts: 1, detailDrafts: 1 },
      status: 'active',
      createdAt: '2026-05-29T00:01:40.000Z',
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
      outputSummary: { title: '실리콘 흡착 식판 테스트 발주 후보' },
      errorCode: null,
      errorMessage: null,
      startedAt: '2026-05-29T00:00:08.000Z',
      completedAt: '2026-05-29T00:00:40.000Z',
      createdAt: '2026-05-29T00:00:08.000Z',
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
      inputSummary: { artifactId: 'artifact-1' },
      outputSummary: null,
      errorCode: null,
      errorMessage: null,
      startedAt: '2026-05-29T00:01:10.000Z',
      completedAt: null,
      createdAt: '2026-05-29T00:01:10.000Z',
    },
    {
      id: 'tool-approval-1',
      organizationId: 'org-1',
      agentInstanceId: 'agent-order-1',
      requestId: 'request-listing-1',
      runId: 'run-order-1',
      approvalRequestId: 'approval-1',
      capabilityKey: 'commerce.submit_listing',
      status: 'waiting_approval',
      policyDecision: 'approval_required',
      reasonCode: 'policy_approval_required',
      resourceType: 'coupang_listing',
      resourceId: null,
      idempotencyKey: 'listing-submit-1',
      inputSummary: { productName: '실리콘 흡착 식판 테스트 발주 후보' },
      outputSummary: null,
      errorCode: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: '2026-05-29T00:02:00.000Z',
    },
  ],
};

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();

  getMock.mockImplementation((path: string) => {
    if (path === '/api/agent-os/instances') {
      return Promise.resolve([
        managerInstance,
        sourcingInstance,
        sourcingToolInstance,
      ]);
    }
    if (path === '/api/agent-os/definitions') {
      return Promise.resolve([
        managerDefinition,
        sourcingDefinition,
        toolDefinition,
      ]);
    }
    if (path === '/api/agent-os/runs?status=running&limit=100') {
      return Promise.resolve({ items: [runningRun] });
    }
    if (path === '/api/agent-os/conversations') {
      return Promise.resolve({ items: [conversation] });
    }
    if (path === '/api/agent-os/conversations/conversation-1/messages') {
      return Promise.resolve({ items: [message] });
    }
    if (path === '/api/agent-os/conversations/conversation-1/graph') {
      return Promise.resolve(conversationGraph);
    }
    if (path === '/api/action-tasks') return Promise.resolve([actionTask]);
    if (path === '/api/dashboard/sales') return Promise.resolve(null);
    if (path === '/api/dashboard/ad') return Promise.resolve(null);
    return Promise.resolve({ items: [] });
  });

  postMock.mockResolvedValue({ ...actionTask, status: 'done' });
});

describe('Agent OS network page', () => {
  it('renders the existing network dashboard as the Agent OS page', async () => {
    renderPage();

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith('/api/agent-os/instances');
    });

    expect((await screen.findAllByText('Manager Agent')).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText('Agents').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sourcing').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1688 Match Tool').length).toBeGreaterThan(0);
    expect(screen.getByText('Agent Network')).toBeInTheDocument();
    expect(screen.getByText('Overview Panel')).toBeInTheDocument();
    expect(screen.queryByText('Operator Chat')).not.toBeInTheDocument();
  });

  it('opens the Operator workspace over the network page', async () => {
    renderPage();

    await screen.findAllByText('Manager Agent');
    fireEvent.click(screen.getByRole('button', { name: 'Operator 대화' }));

    expect(await screen.findByText('Operator Chat')).toBeInTheDocument();
    expect(screen.getByText('Execution Canvas')).toBeInTheDocument();
    expect(screen.getByText('Node Detail')).toBeInTheDocument();
    expect(await screen.findByText('Sourcing Agent')).toBeInTheDocument();
    expect(await screen.findByText('Listing Agent')).toBeInTheDocument();
    expect(await screen.findByText('Scrape Url')).toBeInTheDocument();
    expect(await screen.findByText('Create Generation Package')).toBeInTheDocument();
    expect(
      (await screen.findAllByText('User approval required')).length,
    ).toBeGreaterThan(0);
    expect(await screen.findByRole('button', { name: '승인' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '거절' })).toBeInTheDocument();
    expect(await screen.findByText('실리콘 식판 시장 기회')).toBeInTheDocument();
    expect(
      await screen.findByText('실리콘 식판 반응 오는 신제품 찾아줘'),
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByText('실리콘 흡착 식판 테스트 발주 후보')).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Agent Network')).toBeInTheDocument();
  });

  it('opens the action board from the network toolbar', async () => {
    renderPage();

    await screen.findAllByText('Manager Agent');
    fireEvent.click(screen.getByRole('button', { name: '액션 보드' }));

    expect(await screen.findByText('Action Board')).toBeInTheDocument();
    expect(screen.getAllByText('소싱 후보 검토').length).toBeGreaterThan(0);
  });
});
