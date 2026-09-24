import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useGenerateDetailPage } from './useGenerateDetailPage';

const apiPost = vi.hoisted(() => vi.fn());
const createRequestId = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: apiPost },
}));

vi.mock('@/lib/secure-random-uuid', () => ({
  createSecureRandomUuid: createRequestId,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useGenerateDetailPage', () => {
  beforeEach(() => {
    apiPost.mockReset();
    createRequestId.mockReset();
    createRequestId.mockReturnValue('quick-process-key');
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it('reuses the browser key when a quick-process response is lost and retried', async () => {
    apiPost
      .mockRejectedValueOnce(new Error('network response lost'))
      .mockResolvedValueOnce({ message: 'started' });
    const { result } = renderHook(() => useGenerateDetailPage('sales-product-1'), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ mode: 'full' })).rejects.toThrow('network response lost');
    });
    await act(async () => {
      await result.current.mutateAsync({ mode: 'full' });
    });

    expect(apiClient.post).toHaveBeenNthCalledWith(
      1,
      '/api/products/sales-products/sales-product-1/generation',
      { task: 'all' },
      { headers: { 'Idempotency-Key': 'quick-process-key' } },
    );
    expect(apiClient.post).toHaveBeenNthCalledWith(
      2,
      '/api/products/sales-products/sales-product-1/generation',
      { task: 'all' },
      { headers: { 'Idempotency-Key': 'quick-process-key' } },
    );
    expect(createRequestId).toHaveBeenCalledTimes(1);
  });

  it('starts the draft generation with the chosen template and refreshes the draft workspace', async () => {
    apiPost.mockResolvedValueOnce({ ok: true, contentWorkspaceId: 'workspace-1' });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useGenerateDetailPage('sales-product-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ mode: 'draft', templateId: 'kids-playful' });
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/products/sales-products/sales-product-1/generation',
      { task: 'detail', templateId: 'kids-playful' },
      { headers: { 'Idempotency-Key': 'quick-process-key' } },
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.contentWorkspaces.forSalesProduct('sales-product-1'),
    });
  });
});
