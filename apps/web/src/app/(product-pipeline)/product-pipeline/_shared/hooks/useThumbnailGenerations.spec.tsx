import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useCancelGeneration, useGenerationList } from './useThumbnailGenerations';
import { apiClient } from '@/lib/api-client';

const mockApiPost = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
    post: mockApiPost,
    delete: vi.fn(),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useCancelGeneration', () => {
  beforeEach(() => {
    mockApiPost.mockReset();
    mockApiPost.mockResolvedValue({
      status: 'cancelled',
      generationId: 'thumbnail-generation-1',
      preserved: false,
    });
  });

  it('cancels the thumbnail generation through its durable owner endpoint', async () => {
    const { result } = renderHook(() => useCancelGeneration(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('thumbnail-generation-1');
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/thumbnail-analysis/generations/thumbnail-generation-1/cancel',
      { reason: '사용자 요청' },
    );
  });
});

describe('useGenerationList', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.get).mockResolvedValue({ items: [], total: 0 });
  });

  it('requests direct-upload scope explicitly for ownerless thumbnail work', async () => {
    renderHook(() => useGenerationList({ scope: 'direct-upload', limit: 8 }), {
      wrapper,
    });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/api/thumbnail-analysis/generations?scope=direct-upload&limit=8');
    });
  });

  it('requests workspace-bound thumbnail history with the canonical identifier', async () => {
    renderHook(() => useGenerationList({ contentWorkspaceId: 'workspace-1', limit: 24 }), { wrapper });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/thumbnail-analysis/generations?contentWorkspaceId=workspace-1&limit=24',
      );
    });
  });
});
