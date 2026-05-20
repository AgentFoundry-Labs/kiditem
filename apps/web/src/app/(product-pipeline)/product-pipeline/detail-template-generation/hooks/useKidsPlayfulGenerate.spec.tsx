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
import { cancelOperation } from '@/lib/operation-cancellation';

const mockApiPost = vi.hoisted(() => vi.fn());
const mockApiGet = vi.hoisted(() => vi.fn());
const mockCancelOperation = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: mockApiPost,
    get: mockApiGet,
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

describe('useKidsPlayfulGenerationCancel', () => {
  beforeEach(() => {
    mockApiPost.mockReset();
    mockApiPost.mockResolvedValue({ id: 'generation-1' });
    mockApiGet.mockReset();
    mockApiGet.mockResolvedValue([]);
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
        contentGenerationIds: ['generation-1'],
        thumbnailGenerationIds: [],
        directAiJobIds: [],
      },
      preserved: {
        contentGenerationIds: [],
        thumbnailGenerationIds: [],
      },
      warnings: [],
    });
  });

  it('routes detail-page generation cancellation through the platform endpoint', async () => {
    const { result } = renderHook(() => useKidsPlayfulGenerationCancel(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('generation-1');
    });

    expect(cancelOperation).toHaveBeenCalledWith({
      targetType: 'content_generation',
      generationId: 'generation-1',
      reason: '사용자 요청',
    });
    expect(apiClient.post).not.toHaveBeenCalledWith('/api/ai/detail-page/generation-1/cancel');
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

  it('queries unpromoted sourcing detail generations by source candidate scope', async () => {
    renderHook(
      () =>
        useKidsPlayfulGenerationList('candidate-1', {
          sourceCandidateId: 'candidate-1',
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/ai/detail-page?templateId=kids-playful&sourceCandidateId=candidate-1',
      );
    });
  });
});
