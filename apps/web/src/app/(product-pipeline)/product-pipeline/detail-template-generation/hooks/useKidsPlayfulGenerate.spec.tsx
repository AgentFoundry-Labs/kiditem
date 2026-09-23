import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  useKidsPlayfulGenerationCancel,
  useKidsPlayfulGenerationList,
} from './useKidsPlayfulGenerate';
import { apiClient } from '@/lib/api-client';

const mockApiPost = vi.hoisted(() => vi.fn());
const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: mockApiPost,
    get: mockApiGet,
    delete: vi.fn(),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useKidsPlayfulGenerationCancel', () => {
  beforeEach(() => {
    mockApiPost.mockReset();
    mockApiPost.mockResolvedValue({ id: 'generation-1' });
    mockApiGet.mockReset();
    mockApiGet.mockResolvedValue([]);
  });

  it('cancels the detail-page generation through its durable owner endpoint', async () => {
    const { result } = renderHook(() => useKidsPlayfulGenerationCancel(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('generation-1');
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/ai/detail-page/generation-1/cancel',
      { reason: '사용자 요청' },
    );
  });
});

describe('useKidsPlayfulGenerationList', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiGet.mockResolvedValue([]);
  });

  it('queries registered workspace detail generations by content workspace scope', async () => {
    renderHook(
      () =>
        useKidsPlayfulGenerationList('candidate-1', {
          contentWorkspaceId: 'workspace-1',
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/ai/detail-page?templateId=kids-playful&contentWorkspaceId=workspace-1',
      );
    });
  });

  it('scopes the detail list to a content workspace and never sends a candidate or product filter', async () => {
    renderHook(
      () => useKidsPlayfulGenerationList('product-1', { contentWorkspaceId: 'workspace-1' }),
      { wrapper },
    );

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/ai/detail-page?templateId=kids-playful&contentWorkspaceId=workspace-1',
      );
    });
  });
});
