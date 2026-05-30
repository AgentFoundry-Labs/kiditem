import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();

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

const conversation = {
  id: 'conversation-1',
  organizationId: 'org-1',
  title: '실리콘 식판 시장 기회',
  status: 'active',
  createdByUserId: 'user-1',
  rootRequestId: 'request-operator-1',
  lastMessageAt: '2026-05-29T00:00:00.000Z',
  createdAt: '2026-05-29T00:00:00.000Z',
  updatedAt: '2026-05-29T00:00:00.000Z',
};

const graph = {
  conversationId: 'conversation-1',
  rootRequestId: 'request-operator-1',
  nodes: [
    {
      id: 'request-operator-1',
      parentId: null,
      kind: 'agent_task',
      label: 'Operator',
      status: 'running',
      agentType: 'manager',
      capabilityKey: null,
      startedAt: '2026-05-29T00:00:00.000Z',
      finishedAt: null,
    },
    {
      id: 'request-sourcing-1',
      parentId: 'request-operator-1',
      kind: 'agent_task',
      label: 'Sourcing Agent',
      status: 'succeeded',
      agentType: 'sourcing',
      capabilityKey: null,
      startedAt: '2026-05-29T00:00:10.000Z',
      finishedAt: '2026-05-29T00:00:20.000Z',
    },
  ],
  artifacts: [
    {
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
      summary: { score: 91, action: '발주 초안 생성' },
      status: 'active',
      createdAt: '2026-05-29T00:00:21.000Z',
    },
  ],
  toolInvocations: [
    {
      id: 'tool-1',
      organizationId: 'org-1',
      agentInstanceId: 'agent-sourcing-1',
      requestId: 'request-sourcing-1',
      runId: 'run-sourcing-1',
      approvalRequestId: null,
      capabilityKey: 'sourcing.create_recommendation_packet',
      status: 'succeeded',
      policyDecision: 'allowed',
      reasonCode: null,
      resourceType: null,
      resourceId: null,
      idempotencyKey: null,
      inputSummary: {},
      outputSummary: {},
      errorCode: null,
      errorMessage: null,
      startedAt: '2026-05-29T00:00:15.000Z',
      completedAt: '2026-05-29T00:00:20.000Z',
      createdAt: '2026-05-29T00:00:15.000Z',
    },
  ],
};

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();

  getMock.mockImplementation((path: string) => {
    if (path === '/api/agent-os/conversations') {
      return Promise.resolve({ items: [conversation] });
    }
    if (path === '/api/agent-os/conversations/conversation-1/messages') {
      return Promise.resolve({
        items: [
          {
            id: 'message-1',
            conversationId: 'conversation-1',
            role: 'user',
            content: '실리콘 식판 반응 오는 신제품 찾아줘',
            agentInstanceId: null,
            requestId: null,
            runId: null,
            metadata: {},
            createdAt: '2026-05-29T00:00:00.000Z',
          },
        ],
      });
    }
    if (path === '/api/agent-os/conversations/conversation-1/graph') {
      return Promise.resolve(graph);
    }
    if (path === '/api/agent-os/instances') return Promise.resolve([]);
    if (path === '/api/agent-os/definitions') return Promise.resolve([]);
    if (path === '/api/agent-os/runs?status=running&limit=100') {
      return Promise.resolve({ items: [] });
    }
    if (path === '/api/action-tasks') return Promise.resolve([]);
    if (path === '/api/dashboard/sales') return Promise.resolve(null);
    if (path === '/api/dashboard/ad') return Promise.resolve(null);
    return Promise.resolve({ items: [] });
  });

  postMock.mockResolvedValue({
    ok: true,
    requestId: 'request-order-1',
    agentType: 'order',
    status: 'pending',
  });
});

describe('Agent OS conversation workspace', () => {
  it('renders the agent network with Operator chat, run graph, and recommendation actions together', async () => {
    renderPage();

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith('/api/agent-os/conversations');
    });

    expect((await screen.findAllByText('Agent Network')).length).toBeGreaterThan(0);
    expect(screen.getByText('Operator Chat')).toBeInTheDocument();
    expect(await screen.findByText('실리콘 식판 시장 기회')).toBeInTheDocument();
    expect(
      await screen.findByText('실리콘 식판 반응 오는 신제품 찾아줘'),
    ).toBeInTheDocument();
    expect(screen.getByText('Run Inspector')).toBeInTheDocument();
    expect(await screen.findByText('Sourcing Agent')).toBeInTheDocument();
    expect(screen.getAllByText('실리콘 흡착 식판 테스트 발주 후보').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '발주 초안' }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        '/api/agent-os/conversations/conversation-1/recommendations/artifact-1/order-draft',
        {},
      );
    });
  });

  it('starts a new Operator conversation from the chat input', async () => {
    postMock.mockResolvedValueOnce({
      conversation: { ...conversation, id: 'conversation-2' },
      rootRequestId: 'request-operator-2',
    });

    renderPage();

    const input = await screen.findByPlaceholderText('시장 기회나 카테고리를 요청하세요');
    fireEvent.change(input, { target: { value: '아동 우비 신제품 찾아줘' } });
    fireEvent.click(screen.getByRole('button', { name: '전송' }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/api/agent-os/conversations', {
        content: '아동 우비 신제품 찾아줘',
      });
    });
  });
});
