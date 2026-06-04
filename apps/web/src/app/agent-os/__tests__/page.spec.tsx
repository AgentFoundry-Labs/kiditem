import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();
const putMock = vi.fn();

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
      put: (path: string, body?: unknown) => putMock(path, body),
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
      agentType: 'manager',
      capabilityKey: null,
      startedAt: '2026-05-29T00:00:00.000Z',
      finishedAt: '2026-05-29T00:00:05.000Z',
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
  ],
  toolInvocations: [
    {
      id: 'tool-approval-1',
      organizationId: 'org-1',
      agentInstanceId: 'agent-order-1',
      requestId: 'request-order-1',
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

const costEvents = {
  totalCostMicros: '1234567',
  items: [
    {
      id: 'cost-1',
      organizationId: 'org-1',
      agentInstanceId: 'agent-sourcing-1',
      requestId: 'request-sourcing-1',
      runId: 'run-sourcing-1',
      provider: 'openai',
      model: 'gpt-5.4',
      inputTokens: 1200,
      outputTokens: 340,
      cachedInputTokens: 200,
      costMicros: '1234567',
      occurredAt: '2026-05-29T00:03:00.000Z',
    },
  ],
};

const authorizationEvents = {
  items: [
    {
      id: 'auth-1',
      organizationId: 'org-1',
      agentInstanceId: 'agent-order-1',
      requestId: 'request-order-1',
      runId: 'run-order-1',
      toolKey: 'channels.register_confirmed_listing',
      action: 'tool_use',
      decision: 'approval_required',
      reasonCode: 'policy_approval_required',
      reason: 'Human approval required.',
      resourceType: 'channels',
      resourceId: null,
      createdAt: '2026-05-29T00:04:00.000Z',
    },
  ],
};

const approvalHistory = {
  items: [
    {
      id: 'approval-1',
      organizationId: 'org-1',
      agentInstanceId: 'agent-order-1',
      requestId: 'request-order-1',
      runId: 'run-order-1',
      status: 'approved',
      reasonCode: 'policy_approval_required',
      reason: 'Human approval required.',
      prompt: '쿠팡 등록을 진행할까요?',
      payload: { productName: '실리콘 흡착 식판 테스트 발주 후보' },
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
    },
  ],
};

const runEvents = {
  items: [
    {
      id: 'event-1',
      runId: 'run-sourcing-1',
      seq: 1,
      type: 'operator.decision',
      level: 'info',
      stream: null,
      message: 'Sourcing Agent delegated listing preparation.',
      data: { playbookKey: 'manual_product_intake_from_url_v1' },
      logRef: null,
      createdAt: '2026-05-29T00:03:00.000Z',
    },
  ],
};

const liveReadiness = {
  allReady: false,
  runnableCapabilities: ['operator_runtime'],
  blockedCapabilities: [
    'channels.submit_coupang_listing',
    'supply.submit_purchase_order_live_checkout',
  ],
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
};

const managerPolicies = {
  items: [
    {
      toolKey: 'channels.register_confirmed_listing',
      effect: 'approval_required',
      source: 'definition',
      approvalMode: 'admin',
      dryRunMode: 'disabled',
      constraints: {},
    },
  ],
};

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  putMock.mockReset();

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
    if (path === '/api/agent-os/cost-events?limit=50') {
      return Promise.resolve(costEvents);
    }
    if (path === '/api/agent-os/authorization-events?limit=50') {
      return Promise.resolve(authorizationEvents);
    }
    if (path === '/api/agent-os/approvals?limit=50') {
      return Promise.resolve(approvalHistory);
    }
    if (path === '/api/agent-os/runs?limit=20') {
      return Promise.resolve({ items: [runningRun] });
    }
    if (path === '/api/agent-os/runs/run-sourcing-1/events?limit=50') {
      return Promise.resolve(runEvents);
    }
    if (path === '/api/readiness/agent-os-live') {
      return Promise.resolve(liveReadiness);
    }
    if (path === '/api/agent-os/instances/agent-manager-1/tool-policies') {
      return Promise.resolve(managerPolicies);
    }
    if (path === '/api/action-tasks') return Promise.resolve([actionTask]);
    if (path === '/api/dashboard/sales') return Promise.resolve(null);
    if (path === '/api/dashboard/ad') return Promise.resolve(null);
    return Promise.resolve({ items: [] });
  });

  postMock.mockResolvedValue({ ...actionTask, status: 'done' });
  putMock.mockResolvedValue({ ok: true });
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
    expect(await screen.findByText('실리콘 식판 시장 기회')).toBeInTheDocument();
    expect(
      await screen.findByText('실리콘 식판 반응 오는 신제품 찾아줘'),
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByText('실리콘 흡착 식판 테스트 발주 후보')).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Agent Network')).toBeInTheDocument();
  });

  it('sends the next Operator turn inside the selected conversation', async () => {
    renderPage();

    await screen.findAllByText('Manager Agent');
    fireEvent.click(screen.getByRole('button', { name: 'Operator 대화' }));
    await screen.findByText('Operator Chat');
    await screen.findByText('실리콘 식판 시장 기회');

    fireEvent.change(screen.getByPlaceholderText('시장 기회나 카테고리를 요청하세요'), {
      target: { value: '유아 컵도 같이 비교해줘' },
    });
    fireEvent.click(screen.getByRole('button', { name: '전송' }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        '/api/agent-os/conversations/conversation-1/messages',
        { content: '유아 컵도 같이 비교해줘' },
      );
    });
  });

  it('approves a waiting tool invocation from the Operator workspace', async () => {
    renderPage();

    await screen.findAllByText('Manager Agent');
    fireEvent.click(screen.getByRole('button', { name: 'Operator 대화' }));
    await screen.findByText('승인 대기');

    fireEvent.click(screen.getByRole('button', { name: '승인' }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        '/api/agent-os/approvals/approval-1/resolve',
        { status: 'approved' },
      );
    });
  });

  it('rejects a waiting tool invocation from the Operator workspace', async () => {
    renderPage();

    await screen.findAllByText('Manager Agent');
    fireEvent.click(screen.getByRole('button', { name: 'Operator 대화' }));
    await screen.findByText('승인 대기');

    fireEvent.click(screen.getByRole('button', { name: '거절' }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        '/api/agent-os/approvals/approval-1/resolve',
        { status: 'rejected' },
      );
    });
  });

  it('opens the action board from the network toolbar', async () => {
    renderPage();

    await screen.findAllByText('Manager Agent');
    fireEvent.click(screen.getByRole('button', { name: '액션 보드' }));

    expect(await screen.findByText('Action Board')).toBeInTheDocument();
    expect(screen.getAllByText('소싱 후보 검토').length).toBeGreaterThan(0);
  });

  it('opens Agent OS audit view with cost and authorization history', async () => {
    renderPage();

    await screen.findAllByText('Manager Agent');
    fireEvent.click(screen.getByRole('button', { name: '운영 감사' }));

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith('/api/agent-os/cost-events?limit=50');
      expect(getMock).toHaveBeenCalledWith(
        '/api/agent-os/authorization-events?limit=50',
      );
      expect(getMock).toHaveBeenCalledWith('/api/agent-os/approvals?limit=50');
      expect(getMock).toHaveBeenCalledWith('/api/agent-os/runs?limit=20');
      expect(getMock).toHaveBeenCalledWith(
        '/api/agent-os/runs/run-sourcing-1/events?limit=50',
      );
      expect(getMock).toHaveBeenCalledWith('/api/readiness/agent-os-live');
    });
    expect(await screen.findByText('Agent OS Audit')).toBeInTheDocument();
    expect(screen.getByText('Total cost')).toBeInTheDocument();
    expect(screen.getByText('Live readiness')).toBeInTheDocument();
    expect(
      screen.getByText('OpenAI Responses Operator Runtime'),
    ).toBeInTheDocument();
    expect(screen.getByText('Coupang Seller Product API')).toBeInTheDocument();
    expect(screen.getByText('Approval history')).toBeInTheDocument();
    expect(screen.getByText('Run logs')).toBeInTheDocument();
    expect(screen.getAllByText('$1.23').length).toBeGreaterThan(0);
    expect(
      screen.getByText('channels.register_confirmed_listing'),
    ).toBeInTheDocument();
    expect(screen.getByText('approval_required')).toBeInTheDocument();
    expect(screen.getByText('쿠팡 등록을 진행할까요?')).toBeInTheDocument();
    expect(
      screen.getByText('Sourcing Agent delegated listing preparation.'),
    ).toBeInTheDocument();
  });

  it('opens policy settings and updates an agent tool policy override', async () => {
    renderPage();

    await screen.findAllByText('Manager Agent');
    fireEvent.click(screen.getByRole('button', { name: '정책 설정' }));

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith(
        '/api/agent-os/instances/agent-manager-1/tool-policies',
      );
    });
    expect(await screen.findByText('Agent Policy')).toBeInTheDocument();
    expect(
      screen.getByText('channels.register_confirmed_listing'),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText(
        'channels.register_confirmed_listing permission effect',
      ),
      { target: { value: 'deny' } },
    );
    fireEvent.click(screen.getByRole('button', { name: '정책 저장' }));

    await waitFor(() => {
      expect(putMock).toHaveBeenCalledWith(
        '/api/agent-os/instances/agent-manager-1/tool-policies/channels.register_confirmed_listing',
        {
          effect: 'deny',
          approvalMode: 'admin',
          dryRunMode: 'disabled',
          constraints: {},
        },
      );
    });
  });

  it('uses the responsive Agent OS shell on mobile widths', async () => {
    renderPage();

    await screen.findAllByText('Manager Agent');

    expect(screen.getByTestId('agent-os-shell')).toHaveClass(
      'max-md:overflow-y-auto',
    );
    expect(screen.getByTestId('agent-os-header-nav')).toHaveClass('hidden');
    expect(screen.getByTestId('agent-os-header-nav')).toHaveClass('md:flex');
    expect(screen.getByTestId('agent-os-live-activity-panel')).toHaveClass(
      'max-md:hidden',
    );
    expect(screen.getByTestId('agent-os-bottom-dashboard')).toHaveClass(
      'max-md:grid-cols-2',
    );
    expect(screen.getByTestId('agent-os-bottom-dashboard')).toHaveClass(
      'max-md:h-auto',
    );
  });
});
