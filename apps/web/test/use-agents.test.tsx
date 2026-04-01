import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

vi.mock('@/lib/agent-api', () => ({
  agentApi: {
    list: vi.fn(),
    org: vi.fn(),
    get: vi.fn(),
    getRuns: vi.fn(),
    getRuntimeState: vi.fn(),
    getCostAnalytics: vi.fn(),
    invoke: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    delete: vi.fn(),
    resetSession: vi.fn(),
    update: vi.fn(),
  },
}));

import { agentApi } from '@/lib/agent-api';
import {
  useAgents,
  useAgentOrg,
  useAgent,
  useAgentRuns,
  useAgentRuntimeState,
  useAgentCostAnalytics,
  useInvokeAgent,
  usePauseAgent,
  useResumeAgent,
  useDeleteAgent,
  useResetAgentSession,
  useUpdateAgent,
} from '@/hooks/use-agents';

const mockAgentApi = vi.mocked(agentApi);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --- useQuery hooks ---

describe('useAgents', () => {
  it('fetches agents list', async () => {
    const agents = [{ id: '1', name: 'ad_strategy' }];
    mockAgentApi.list.mockResolvedValueOnce(agents as any);

    const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(agents);
    expect(mockAgentApi.list).toHaveBeenCalledOnce();
  });
});

describe('useAgentOrg', () => {
  it('fetches org tree', async () => {
    const org = [{ id: '1', name: 'root', children: [] }];
    mockAgentApi.org.mockResolvedValueOnce(org as any);

    const { result } = renderHook(() => useAgentOrg(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(org);
  });
});

describe('useAgent', () => {
  it('fetches single agent by id', async () => {
    const agent = { id: 'abc', name: 'test' };
    mockAgentApi.get.mockResolvedValueOnce(agent as any);

    const { result } = renderHook(() => useAgent('abc'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(agent);
    expect(mockAgentApi.get).toHaveBeenCalledWith('abc');
  });

  it('is disabled when id is empty string', () => {
    const { result } = renderHook(() => useAgent(''), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useAgentRuns', () => {
  it('fetches runs for agent', async () => {
    const runs = [{ id: 'run1', status: 'completed' }];
    mockAgentApi.getRuns.mockResolvedValueOnce(runs as any);

    const { result } = renderHook(() => useAgentRuns('abc', 10), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(runs);
    expect(mockAgentApi.getRuns).toHaveBeenCalledWith('abc', 10);
  });

  it('is disabled when id is empty', () => {
    const { result } = renderHook(() => useAgentRuns(''), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useAgentRuntimeState', () => {
  it('fetches runtime state', async () => {
    const state = { sessionId: 's1', totalTokens: 100 };
    mockAgentApi.getRuntimeState.mockResolvedValueOnce(state as any);

    const { result } = renderHook(() => useAgentRuntimeState('abc'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(state);
  });

  it('handles null state', async () => {
    mockAgentApi.getRuntimeState.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useAgentRuntimeState('abc'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useAgentCostAnalytics', () => {
  it('fetches cost analytics with params', async () => {
    const analytics = { totalCost: 10, totalTokens: 5000 };
    mockAgentApi.getCostAnalytics.mockResolvedValueOnce(analytics as any);

    const params = { from: '2026-01-01', to: '2026-01-31' };
    const { result } = renderHook(() => useAgentCostAnalytics(params), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(analytics);
    expect(mockAgentApi.getCostAnalytics).toHaveBeenCalledWith(params);
  });
});

// --- useMutation hooks ---

describe('useInvokeAgent', () => {
  it('calls agentApi.invoke and invalidates queries', async () => {
    mockAgentApi.invoke.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useInvokeAgent(), { wrapper: createWrapper() });
    await act(() => result.current.mutateAsync('agent-1'));

    expect(mockAgentApi.invoke).toHaveBeenCalledWith('agent-1');
  });
});

describe('usePauseAgent', () => {
  it('calls agentApi.pause with id and reason', async () => {
    mockAgentApi.pause.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => usePauseAgent(), { wrapper: createWrapper() });
    await act(() => result.current.mutateAsync({ id: 'a1', reason: 'test' }));

    expect(mockAgentApi.pause).toHaveBeenCalledWith('a1', 'test');
  });
});

describe('useResumeAgent', () => {
  it('calls agentApi.resume', async () => {
    mockAgentApi.resume.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useResumeAgent(), { wrapper: createWrapper() });
    await act(() => result.current.mutateAsync('a1'));

    expect(mockAgentApi.resume).toHaveBeenCalledWith('a1');
  });
});

describe('useDeleteAgent', () => {
  it('calls agentApi.delete', async () => {
    mockAgentApi.delete.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useDeleteAgent(), { wrapper: createWrapper() });
    await act(() => result.current.mutateAsync('a1'));

    expect(mockAgentApi.delete).toHaveBeenCalledWith('a1');
  });
});

describe('useResetAgentSession', () => {
  it('calls agentApi.resetSession', async () => {
    mockAgentApi.resetSession.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useResetAgentSession(), { wrapper: createWrapper() });
    await act(() => result.current.mutateAsync('a1'));

    expect(mockAgentApi.resetSession).toHaveBeenCalledWith('a1');
  });
});

describe('useUpdateAgent', () => {
  it('calls agentApi.update with id and data', async () => {
    mockAgentApi.update.mockResolvedValueOnce({ id: 'a1', name: 'updated' } as any);

    const { result } = renderHook(() => useUpdateAgent(), { wrapper: createWrapper() });
    await act(() => result.current.mutateAsync({ id: 'a1', data: { name: 'updated' } }));

    expect(mockAgentApi.update).toHaveBeenCalledWith('a1', { name: 'updated' });
  });
});
