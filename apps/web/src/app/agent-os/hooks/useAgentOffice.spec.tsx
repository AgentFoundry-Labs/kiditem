import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useLayoutEffect, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listRosterMock = vi.hoisted(() => vi.fn());
const listRunsMock = vi.hoisted(() => vi.fn());
const listRequestsMock = vi.hoisted(() => vi.fn());
const listApprovalsMock = vi.hoisted(() => vi.fn());
const listConversationsMock = vi.hoisted(() => vi.fn());
const listCostEventsMock = vi.hoisted(() => vi.fn());
const listAuthorizationEventsMock = vi.hoisted(() => vi.fn());
const createConversationMock = vi.hoisted(() => vi.fn());
const sendMessageMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}));

vi.mock('../lib/agent-os-api', () => ({
  agentOsApi: {
    listRoster: (...args: unknown[]) => listRosterMock(...args),
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

import { makeAgentRosterItem } from '../test-utils/agent-office-fixtures';
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
    listRosterMock.mockReset();
    listRunsMock.mockReset();
    listRequestsMock.mockReset();
    listApprovalsMock.mockReset();
    listConversationsMock.mockReset();
    listCostEventsMock.mockReset();
    listAuthorizationEventsMock.mockReset();
    createConversationMock.mockReset();
    sendMessageMock.mockReset();
    toastErrorMock.mockReset();

    listRosterMock.mockResolvedValue({ items: [makeAgentRosterItem()] });
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

  it('selects the first staff member after the office model loads', async () => {
    const { result } = renderHook(() => useAgentOffice(), { wrapper });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(result.current.selectedNodeId).toBe('manager');
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

  it('sends the selected employee as a delegation hint through Operator', async () => {
    listRosterMock.mockResolvedValue({
      items: [
        makeAgentRosterItem(),
        makeAgentRosterItem({
          definition: {
            type: 'sourcing',
            name: 'Sourcing',
            displayName: '소싱 담당',
            responsibility: '상품 후보를 선별한다.',
            officeOrder: 400,
          },
          runtime: {
            ...makeAgentRosterItem().runtime!,
            instanceId: 'agent-sourcing',
          },
        }),
      ],
    });

    const { result } = renderHook(() => useAgentOffice(), { wrapper });

    await waitFor(() => expect(result.current.isPending).toBe(false));

    act(() => {
      result.current.setSelectedNodeId('sourcing');
      result.current.setCommand('신규 상품 후보를 정리해줘');
    });
    act(() => result.current.submitCommand());

    await waitFor(() => {
      expect(createConversationMock).toHaveBeenCalledWith({
        content: [
          '[Agent OS 업무 배정 요청]',
          '대상 직원: 소싱 담당',
          '대상 직원 유형: sourcing',
          '업무: 신규 상품 후보를 정리해줘',
        ].join('\n'),
      });
    });
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
      expect(listRosterMock).toHaveBeenCalled();
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

  it('does not submit when Operator runtime is missing', async () => {
    listRosterMock.mockResolvedValue({
      items: [
        makeAgentRosterItem({
          runtime: null,
          configurationStatus: 'instance_missing',
        }),
      ],
    });
    const { result } = renderHook(() => useAgentOffice(), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));

    act(() => result.current.setCommand('운영 현황을 정리해줘'));
    act(() => result.current.submitCommand());

    expect(createConversationMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      '운영 총괄의 실행 설정이 필요합니다.',
    );
  });

  it('does not submit to an unconfigured selected employee', async () => {
    listRosterMock.mockResolvedValue({
      items: [
        makeAgentRosterItem(),
        makeAgentRosterItem({
          definition: {
            type: 'sourcing',
            name: 'Sourcing',
            displayName: '소싱 담당',
            responsibility: '상품 후보를 선별한다.',
            officeOrder: 400,
          },
          runtime: null,
          configurationStatus: 'instance_missing',
        }),
      ],
    });
    const { result } = renderHook(() => useAgentOffice(), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));

    act(() => {
      result.current.setSelectedNodeId('sourcing');
      result.current.setCommand('신규 상품 후보를 정리해줘');
    });
    act(() => result.current.submitCommand());

    expect(createConversationMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      '소싱 담당의 실행 설정이 필요합니다.',
    );
  });

  it('blocks a stale employee selection during roster refresh after non-empty content exists', async () => {
    const rosterWithSourcing = {
      items: [
        makeAgentRosterItem(),
        makeAgentRosterItem({
          definition: {
            type: 'sourcing',
            name: 'Sourcing',
            displayName: '소싱 담당',
            responsibility: '상품 후보를 선별한다.',
            officeOrder: 400,
          },
          runtime: {
            ...makeAgentRosterItem().runtime!,
            instanceId: 'agent-sourcing',
          },
        }),
      ],
    };
    const rosterWithoutSourcing = { items: [makeAgentRosterItem()] };
    let submitWhenSelectionBecomesStale = false;

    listRosterMock.mockResolvedValue(rosterWithSourcing);
    createConversationMock.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(
      () => {
        const office = useAgentOffice();

        useLayoutEffect(() => {
          const selectionIsStale =
            office.selectedNodeId !== null &&
            !office.model.nodes.some(
              (node) => node.id === office.selectedNodeId,
            );

          if (!submitWhenSelectionBecomesStale || !selectionIsStale) return;

          submitWhenSelectionBecomesStale = false;
          office.submitCommand();
        }, [office.model.nodes, office.selectedNodeId, office.submitCommand]);

        return office;
      },
      { wrapper },
    );

    await waitFor(() => expect(result.current.selectedNodeId).toBe('manager'));

    act(() => result.current.setSelectedNodeId('sourcing'));
    listRosterMock.mockResolvedValue(rosterWithoutSourcing);
    submitWhenSelectionBecomesStale = true;
    act(() => result.current.refresh());

    await waitFor(() => {
      expect(submitWhenSelectionBecomesStale).toBe(false);
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(createConversationMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();

    await waitFor(() => expect(result.current.selectedNodeId).toBe('manager'));

    listRosterMock.mockResolvedValue(rosterWithSourcing);
    act(() => result.current.refresh());
    await waitFor(() => {
      expect(
        result.current.model.nodes.some((node) => node.id === 'sourcing'),
      ).toBe(true);
    });

    act(() => {
      result.current.setSelectedNodeId('sourcing');
      result.current.setCommand('신규 상품 후보를 정리해줘');
    });
    listRosterMock.mockResolvedValue(rosterWithoutSourcing);
    submitWhenSelectionBecomesStale = true;
    act(() => result.current.refresh());

    await waitFor(() => {
      expect(submitWhenSelectionBecomesStale).toBe(false);
    });
    expect(createConversationMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      '선택한 직원을 다시 선택해 주세요.',
    );
  });

  it('surfaces a roster request failure through the hook error contract', async () => {
    listRosterMock.mockRejectedValue(new Error('roster unavailable'));
    const { result } = renderHook(() => useAgentOffice(), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toMatchObject({
        message: 'roster unavailable',
      });
    });
  });
});
