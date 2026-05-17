import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useCancelGeneration } from './useThumbnailGenerations';
import { cancelOperation } from '@/lib/operation-cancellation';

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
