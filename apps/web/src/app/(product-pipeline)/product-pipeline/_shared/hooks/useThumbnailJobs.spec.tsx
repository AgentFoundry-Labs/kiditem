import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { useCancelThumbnailJob, useDeleteThumbnailCandidate, useThumbnailJobs } from './useThumbnailJobs';

// 서버 API 는 웹의 외부 경계라 apiClient 만 바꾼다.
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

const W1 = '00000000-0000-4000-8000-000000000001';
const W2 = '00000000-0000-4000-8000-000000000002';
const J1 = '00000000-0000-4000-8000-0000000000a1';
const J2 = '00000000-0000-4000-8000-0000000000a2';
const SP1 = '00000000-0000-4000-8000-0000000000c1';
const A1 = '00000000-0000-4000-8000-0000000000b1';
const A2 = '00000000-0000-4000-8000-0000000000b2';

const job = (id: string, contentWorkspaceId: string, status: string) => ({
  id, contentWorkspaceId, status, method: 'generate', prompt: null, errorMessage: null, attemptCount: 1,
  createdAt: '2026-09-23T00:00:00.000Z', updatedAt: '2026-09-23T00:00:00.000Z',
});
const asset = (id: string, thumbnailGenerationId: string, isCurrentThumbnail: boolean) => ({
  id, contentWorkspaceId: W1, source: 'ai', role: 'thumbnail', url: `https://cdn.example.com/${id}.png`, label: null,
  sortOrder: 0, width: null, height: null, thumbnailGenerationId, isCurrentThumbnail, createdAt: '2026-09-23T00:00:00.000Z',
});

let jobsResponse: unknown;
beforeEach(() => {
  vi.clearAllMocks();
  jobsResponse = {
    items: [job(J1, W1, 'succeeded'), job(J2, W2, 'running')],
    candidates: [asset(A1, J1, true), asset(A2, J1, false)],
    workspaces: [
      { id: W1, salesProductId: SP1, name: '자석 다트게임', imageUrl: 'https://cdn.example.com/source.jpg' },
      { id: W2, salesProductId: null, name: '', imageUrl: null },
    ],
    total: 2,
  };
  vi.mocked(apiClient.get).mockImplementation(async (href: string) => {
    if (href.startsWith('/api/thumbnail-analysis/generations')) return jobsResponse;
    return {
      items: [{
        salesProductId: SP1, assetId: A1, executionId: 'e1', status: 'reconciling', providerOutcome: 'uncertain',
        checkedAt: '2026-09-23T01:00:00.000Z', error: 'port closed', screenshotPath: null,
      }],
    };
  });
});
afterEach(cleanup);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useThumbnailJobs', () => {
  it('joins each job with its candidate assets, its workspace and the mall status of the adopted candidate', async () => {
    const { result } = renderHook(() => useThumbnailJobs({ contentWorkspaceId: W1, limit: 24 }), { wrapper });

    await waitFor(() => expect(result.current.data?.[0]?.registrationStatus).toBe('checking'));
    const [first, second] = result.current.data!;
    expect(first).toMatchObject({
      id: J1,
      workspace: { id: W1, salesProductId: SP1, name: '자석 다트게임' },
      adoptedCandidate: { id: A1 },
      registrationExecutionId: 'e1',
      registrationError: 'port closed',
    });
    expect(first.candidates.map((candidate) => candidate.id)).toEqual([A1, A2]);
    expect(second).toMatchObject({ id: J2, candidates: [], adoptedCandidate: null, registrationStatus: null });

    const reads = vi.mocked(apiClient.get).mock.calls.map(([href]) => href);
    expect(reads).toEqual([
      `/api/thumbnail-analysis/generations?contentWorkspaceId=${W1}&limit=24`,
      `/api/channels/thumbnail-executions?salesProductIds=${SP1}`,
    ]);
  });

  it('requests the direct-upload scope explicitly for ownerless jobs', async () => {
    renderHook(() => useThumbnailJobs({ scope: 'direct-upload', limit: 8 }), { wrapper });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/api/thumbnail-analysis/generations?scope=direct-upload&limit=8');
    });
  });
});

describe('thumbnail job mutations', () => {
  it('removes one candidate by its asset id', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ ok: true, generationDeleted: false, remaining: 1 });
    const { result } = renderHook(() => useDeleteThumbnailCandidate(), { wrapper });

    await act(async () => { await result.current.mutateAsync({ jobId: J1, assetId: A2 }); });

    expect(apiClient.delete).toHaveBeenCalledWith(`/api/thumbnail-analysis/generations/${J1}/candidates`, { assetId: A2 });
  });

  it('cancels a job through its durable owner endpoint', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ status: 'cancelled', generationId: J2, preserved: false });
    const { result } = renderHook(() => useCancelThumbnailJob(), { wrapper });

    await act(async () => { await result.current.mutateAsync(J2); });

    expect(apiClient.post).toHaveBeenCalledWith(`/api/thumbnail-analysis/generations/${J2}/cancel`, { reason: '사용자 요청' });
  });
});
