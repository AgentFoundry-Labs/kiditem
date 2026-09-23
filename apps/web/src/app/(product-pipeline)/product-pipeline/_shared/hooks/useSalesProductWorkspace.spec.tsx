import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { useSalesProductWorkspace } from './useSalesProductWorkspace';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn() } }));

const SALES_PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useSalesProductWorkspace', () => {
  beforeEach(() => vi.mocked(apiClient.get).mockReset());

  it('asks by sales product and returns the workspace id', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ workspace: { id: 'workspace-1', salesProductId: SALES_PRODUCT_ID } });
    const { result } = renderHook(() => useSalesProductWorkspace(SALES_PRODUCT_ID), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.workspaceId).toBe('workspace-1'));
    expect(apiClient.get).toHaveBeenCalledWith(`/api/ai/content-workspaces/by-sales-product/${SALES_PRODUCT_ID}`);
  });

  it('answers no workspace for a draft that has no content yet', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ workspace: null });
    const { result } = renderHook(() => useSalesProductWorkspace(SALES_PRODUCT_ID), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.workspaceId).toBeNull();
  });

  it('does not ask at all without a sales product', () => {
    const { result } = renderHook(() => useSalesProductWorkspace(null), { wrapper: wrapper() });
    expect(result.current).toEqual({ workspaceId: null, workspace: null, isLoading: false });
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
