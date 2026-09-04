import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
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

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useGenerateDetailPage', () => {
  beforeEach(() => {
    apiPost.mockReset();
    createRequestId.mockReset();
    createRequestId.mockReturnValue('quick-process-key');
  });

  it('reuses the browser key when a quick-process response is lost and retried', async () => {
    apiPost
      .mockRejectedValueOnce(new Error('network response lost'))
      .mockResolvedValueOnce({ message: 'started' });
    const { result } = renderHook(() => useGenerateDetailPage('candidate-1'), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ mode: 'full' })).rejects.toThrow('network response lost');
    });
    await act(async () => {
      await result.current.mutateAsync({ mode: 'full' });
    });

    expect(apiClient.post).toHaveBeenNthCalledWith(
      1,
      '/api/sourcing/candidates/candidate-1/quick-process',
      { task: 'all' },
      { headers: { 'Idempotency-Key': 'quick-process-key' } },
    );
    expect(apiClient.post).toHaveBeenNthCalledWith(
      2,
      '/api/sourcing/candidates/candidate-1/quick-process',
      { task: 'all' },
      { headers: { 'Idempotency-Key': 'quick-process-key' } },
    );
    expect(createRequestId).toHaveBeenCalledTimes(1);
  });
});
