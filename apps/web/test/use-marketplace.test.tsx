import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

vi.mock('@/lib/marketplace-api', () => ({
  marketplaceApi: {
    listWorkflows: vi.fn(),
    listAgents: vi.fn(),
    installWorkflow: vi.fn(),
    uninstallWorkflow: vi.fn(),
    installAgent: vi.fn(),
    uninstallAgent: vi.fn(),
  },
}));

import { marketplaceApi } from '@/lib/marketplace-api';
import {
  useMarketplaceWorkflows,
  useMarketplaceAgents,
  useInstallWorkflow,
  useUninstallWorkflow,
  useInstallAgent,
  useUninstallAgent,
} from '@/hooks/use-marketplace';

const mockMarketplaceApi = vi.mocked(marketplaceApi);

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

describe('useMarketplaceWorkflows', () => {
  it('fetches marketplace workflows', async () => {
    const items = [{ id: 'mw1', name: 'inventory-check' }];
    mockMarketplaceApi.listWorkflows.mockResolvedValueOnce(items as any);

    const { result } = renderHook(() => useMarketplaceWorkflows(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(items);
  });

  it('passes query params', async () => {
    mockMarketplaceApi.listWorkflows.mockResolvedValueOnce([]);

    const query = { module: 'sourcing', category: 'automation' };
    const { result } = renderHook(() => useMarketplaceWorkflows(query), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockMarketplaceApi.listWorkflows).toHaveBeenCalledWith(query);
  });
});

describe('useMarketplaceAgents', () => {
  it('fetches marketplace agents', async () => {
    const items = [{ id: 'ma1', name: 'ad_strategy' }];
    mockMarketplaceApi.listAgents.mockResolvedValueOnce(items as any);

    const { result } = renderHook(() => useMarketplaceAgents(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(items);
  });

  it('passes query params', async () => {
    mockMarketplaceApi.listAgents.mockResolvedValueOnce([]);

    const query = { role: 'specialist', category: 'ads' };
    const { result } = renderHook(() => useMarketplaceAgents(query), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockMarketplaceApi.listAgents).toHaveBeenCalledWith(query);
  });
});

// --- useMutation hooks ---

describe('useInstallWorkflow', () => {
  it('calls installWorkflow with id and params', async () => {
    mockMarketplaceApi.installWorkflow.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useInstallWorkflow(), { wrapper: createWrapper() });
    const params = { schedule: '0 9 * * *' };
    await act(() => result.current.mutateAsync({ id: 'mw1', params }));

    expect(mockMarketplaceApi.installWorkflow).toHaveBeenCalledWith('mw1', { params });
  });
});

describe('useUninstallWorkflow', () => {
  it('calls uninstallWorkflow', async () => {
    mockMarketplaceApi.uninstallWorkflow.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useUninstallWorkflow(), { wrapper: createWrapper() });
    await act(() => result.current.mutateAsync('mw1'));

    expect(mockMarketplaceApi.uninstallWorkflow).toHaveBeenCalledWith('mw1');
  });
});

describe('useInstallAgent', () => {
  it('calls installAgent with id and params', async () => {
    mockMarketplaceApi.installAgent.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useInstallAgent(), { wrapper: createWrapper() });
    await act(() => result.current.mutateAsync({ id: 'ma1', params: { budget: 100 } }));

    expect(mockMarketplaceApi.installAgent).toHaveBeenCalledWith('ma1', { params: { budget: 100 } });
  });
});

describe('useUninstallAgent', () => {
  it('calls uninstallAgent', async () => {
    mockMarketplaceApi.uninstallAgent.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useUninstallAgent(), { wrapper: createWrapper() });
    await act(() => result.current.mutateAsync('ma1'));

    expect(mockMarketplaceApi.uninstallAgent).toHaveBeenCalledWith('ma1');
  });
});
