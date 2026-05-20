import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useCancelGeneration, useGenerationList } from './useThumbnailGenerations';
import { cancelOperation } from '@/lib/operation-cancellation';
import { apiClient } from '@/lib/api-client';

const mockCancelOperation = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/operation-cancellation', () => ({
  cancelOperation: mockCancelOperation,
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useCancelGeneration', () => {
  beforeEach(() => {
    mockCancelOperation.mockReset();
    mockCancelOperation.mockResolvedValue({
      ok: true,
      status: 'cancelled',
      message: '중단 요청이 반영되었습니다.',
      operationKey: null,
      affected: {
        workflowRunIds: [],
        agentRunRequestIds: [],
        agentRunIds: [],
        contentGenerationIds: [],
        thumbnailGenerationIds: ['thumbnail-generation-1'],
        directAiJobIds: [],
      },
      preserved: {
        contentGenerationIds: [],
        thumbnailGenerationIds: [],
      },
      warnings: [],
    });
  });

  it('routes thumbnail generation cancellation through the platform endpoint', async () => {
    const { result } = renderHook(() => useCancelGeneration(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('thumbnail-generation-1');
    });

    expect(cancelOperation).toHaveBeenCalledWith({
      targetType: 'thumbnail_generation',
      generationId: 'thumbnail-generation-1',
      reason: '사용자 요청',
    });
  });
});

describe('useGenerationList', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.get).mockResolvedValue({ items: [], total: 0 });
  });

  it('requests direct-upload scope explicitly for ownerless thumbnail work', async () => {
    renderHook(() => useGenerationList({ scope: 'direct-upload', limit: 8 }), { wrapper });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/thumbnail-analysis/generations?scope=direct-upload&limit=8',
      );
    });
  });

  it('requests source candidate scoped thumbnail history', async () => {
    renderHook(() => useGenerationList({ sourceCandidateId: 'candidate-1', limit: 24 }), {
      wrapper,
    });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/thumbnail-analysis/generations?sourceCandidateId=candidate-1&limit=24',
      );
    });
  });
});
