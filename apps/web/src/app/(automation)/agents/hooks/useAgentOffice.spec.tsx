import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listInstancesMock = vi.hoisted(() => vi.fn());
const listRunsMock = vi.hoisted(() => vi.fn());
const listRequestsMock = vi.hoisted(() => vi.fn());
const listApprovalsMock = vi.hoisted(() => vi.fn());
const listConversationsMock = vi.hoisted(() => vi.fn());
const listCostEventsMock = vi.hoisted(() => vi.fn());
const listAuthorizationEventsMock = vi.hoisted(() => vi.fn());
const createConversationMock = vi.hoisted(() => vi.fn());
const sendMessageMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/agent-os-api', () => ({
  agentOsApi: {
    listInstances: (...args: unknown[]) => listInstancesMock(...args),
    listRuns: (...args: unknown[]) => listRunsMock(...args),
    listRequests: (...args: unknown[]) => listRequestsMock(...args),
    listApprovals: (...args: unknown[]) => listApprovalsMock(...args),
    listConversations: (...args: unknown[]) => listConversationsMock(...args),
    listCostEvents: (...args: unknown[]) => listCostEventsMock(...args),
    listAuthorizationEvents: (...args: unknown[]) =>
      listAuthorizationEventsMock(...args),
    createConversation: (...args: unknown[]) => createConversationMock(...args),
    sendMessage: (...args: unknown[]) => sendMessageMock(...args),
  },
}));

import { useAgentOffice } from './useAgentOffice';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useAgentOffice', () => {
  beforeEach(() => {
    listInstancesMock.mockReset();
    listRunsMock.mockReset();
    listRequestsMock.mockReset();
    listApprovalsMock.mockReset();
    listConversationsMock.mockReset();
    listCostEventsMock.mockReset();
    listAuthorizationEventsMock.mockReset();
    createConversationMock.mockReset();
    sendMessageMock.mockReset();

    listInstancesMock.mockResolvedValue([
      {
        id: 'agent-manager',
        organizationId: 'org-1',
        type: 'manager',
        name: 'Operator',
        role: 'ceo',
        title: '대표실',
        icon: null,
        reportsToId: null,
        lifecycleStatus: 'active',
        pauseReason: null,
        trustLevel: 5,
        adapterType: 'operator',
        modelOverride: null,
        effectiveModel: 'gpt-5.4',
      },
    ]);
    listRunsMock.mockResolvedValue({ items: [] });
    listRequestsMock.mockResolvedValue({ items: [] });
    listApprovalsMock.mockResolvedValue({ items: [] });
    listConversationsMock.mockResolvedValue({ items: [] });
    listCostEventsMock.mockResolvedValue({ items: [], totalCostMicros: '0' });
    listAuthorizationEventsMock.mockResolvedValue({ items: [] });
    createConversationMock.mockResolvedValue({
      conversation: {
        id: 'conversation-new',
        organizationId: 'org-1',
        title: '새 대화',
        status: 'active',
        createdByUserId: 'user-1',
        rootRequestId: null,
        lastMessageAt: '2026-07-09T00:04:00.000Z',
        createdAt: '2026-07-09T00:04:00.000Z',
        updatedAt: '2026-07-09T00:04:00.000Z',
      },
      message: {
        id: 'message-new',
        conversationId: 'conversation-new',
        role: 'user',
        content: 'hello',
        agentInstanceId: null,
        requestId: null,
        runId: null,
        metadata: {},
        createdAt: '2026-07-09T00:04:00.000Z',
      },
      rootRequestId: null,
    });
    sendMessageMock.mockResolvedValue({
      conversation: {
        id: 'conversation-active',
        organizationId: 'org-1',
        title: '기존 대화',
        status: 'active',
        createdByUserId: 'user-1',
        rootRequestId: null,
        lastMessageAt: '2026-07-09T00:05:00.000Z',
        createdAt: '2026-07-09T00:00:00.000Z',
        updatedAt: '2026-07-09T00:05:00.000Z',
      },
      message: {
        id: 'message-2',
        conversationId: 'conversation-active',
        role: 'user',
        content: 'hello again',
        agentInstanceId: null,
        requestId: null,
        runId: null,
        metadata: {},
        createdAt: '2026-07-09T00:05:00.000Z',
      },
      rootRequestId: null,
    });
  });

  it('reuses the most recent active conversation when returning with no local conversation state', async () => {
    listConversationsMock.mockResolvedValue({
      items: [
        {
          id: 'conversation-complete',
          organizationId: 'org-1',
          title: '닫힌 대화',
          status: 'completed',
          createdByUserId: 'user-1',
          rootRequestId: null,
          lastMessageAt: '2026-07-09T00:06:00.000Z',
          createdAt: '2026-07-09T00:01:00.000Z',
          updatedAt: '2026-07-09T00:06:00.000Z',
        },
        {
          id: 'conversation-active',
          organizationId: 'org-1',
          title: '진행 중 대화',
          status: 'active',
          createdByUserId: 'user-1',
          rootRequestId: null,
          lastMessageAt: '2026-07-09T00:05:00.000Z',
          createdAt: '2026-07-09T00:00:00.000Z',
          updatedAt: '2026-07-09T00:05:00.000Z',
        },
      ],
    });

    const { result } = renderHook(() => useAgentOffice(), { wrapper });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    act(() => {
      result.current.setCommand('계속 이어서 진행해줘');
    });

    act(() => {
      result.current.submitCommand();
    });

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith('conversation-active', {
        content: '계속 이어서 진행해줘',
      });
    });

    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it('stays pending until all HQ model queries finish their initial load', async () => {
    const runs = deferred<{ items: [] }>();
    const requests = deferred<{ items: [] }>();
    const approvals = deferred<{ items: [] }>();
    const conversations = deferred<{ items: [] }>();
    const cost = deferred<{ items: []; totalCostMicros: string }>();
    const authorization = deferred<{ items: [] }>();

    listRunsMock.mockReturnValue(runs.promise);
    listRequestsMock.mockReturnValue(requests.promise);
    listApprovalsMock.mockReturnValue(approvals.promise);
    listConversationsMock.mockReturnValue(conversations.promise);
    listCostEventsMock.mockReturnValue(cost.promise);
    listAuthorizationEventsMock.mockReturnValue(authorization.promise);

    const { result } = renderHook(() => useAgentOffice(), { wrapper });

    await waitFor(() => {
      expect(listInstancesMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    await act(async () => {
      runs.resolve({ items: [] });
      requests.resolve({ items: [] });
      approvals.resolve({ items: [] });
      conversations.resolve({ items: [] });
      cost.resolve({ items: [], totalCostMicros: '0' });
      authorization.resolve({ items: [] });
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });
});
