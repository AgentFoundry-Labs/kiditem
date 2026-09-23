import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { useClearRegistrationError, useGenerationList, useMarkRegistrationNotApplied } from './useThumbnailGenerations';

// 서버 API 는 웹의 외부 경계라 apiClient 만 바꾼다.
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

const G1 = '00000000-0000-4000-8000-000000000001';
const G2 = '00000000-0000-4000-8000-000000000002';
const generation = (id: string, phase: 'ready' | 'applied') => ({
  id, contentWorkspaceId: 'w', originalUrl: null, candidates: [], selectedUrl: null, status: 'succeeded', phase,
  grade: 'A', score: 90, method: 'edit', editAnalysis: null, createdAt: '2026-09-23T00:00:00.000Z',
  contentWorkspace: { id: 'w', name: '상품', imageUrl: null, coupangProductId: null, category: null },
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => ({ list: useGenerationList(), clear: useClearRegistrationError(), notApplied: useMarkRegistrationNotApplied() }), { wrapper });
}

let executionStatus = 'reconciling';
beforeEach(() => {
  vi.clearAllMocks();
  executionStatus = 'reconciling';
  vi.mocked(apiClient.get).mockImplementation(async (href: string) => {
    if (href.startsWith('/api/thumbnail-analysis/generations')) {
      return { items: [generation(G1, 'applied'), generation(G2, 'ready')], total: 2 };
    }
    return {
      items: [{
        generationId: G1, executionId: 'e1', status: executionStatus, providerOutcome: executionStatus === 'succeeded' ? 'succeeded' : 'uncertain',
        checkedAt: '2026-09-23T01:00:00.000Z', error: executionStatus === 'succeeded' ? null : 'port closed', screenshotPath: null,
      }],
    };
  });
  vi.mocked(apiClient.delete).mockResolvedValue({ dismissed: true });
});
afterEach(cleanup);

describe('generation list with Channels mall registration status', () => {
  it('keeps loading until the Channels status arrives, so an applied item never looks unregistered', async () => {
    let releaseStatus: (value: unknown) => void = () => {};
    vi.mocked(apiClient.get).mockImplementation(async (href: string) => {
      if (href.startsWith('/api/thumbnail-analysis/generations')) {
        return { items: [generation(G1, 'applied'), generation(G2, 'ready')], total: 2 };
      }
      return new Promise((resolve) => { releaseStatus = resolve; });
    });
    const hook = mount();
    await waitFor(() => expect(hook.result.current.list.data).toHaveLength(2));
    expect(hook.result.current.list.isLoading).toBe(true);

    releaseStatus({ items: [] });
    await waitFor(() => expect(hook.result.current.list.isLoading).toBe(false));
    expect(Object.keys(hook.result.current.list).sort()).toEqual(['data', 'error', 'isError', 'isLoading', 'refetch']);
  });

  it('reads the latest execution for applied generations once and merges it by generation id', async () => {
    const hook = mount();
    await waitFor(() => expect(hook.result.current.list.data?.[0]?.registrationStatus).toBe('checking'));
    expect(hook.result.current.list.data).toMatchObject([
      { id: G1, registrationStatus: 'checking', registrationError: 'port closed' },
      { id: G2, registrationStatus: null, registrationError: null },
    ]);
    const statusReads = vi.mocked(apiClient.get).mock.calls.map(([href]) => href).filter((href) => href.startsWith('/api/channels/'));
    expect(statusReads).toEqual([`/api/channels/thumbnail-executions?generationIds=${G1}`]);
  });

  it('clears a failure through the Channels delete and reads the status again', async () => {
    executionStatus = 'failed';
    const hook = mount();
    await waitFor(() => expect(hook.result.current.list.data?.[0]?.registrationStatus).toBe('failed'));

    executionStatus = 'succeeded';
    await act(async () => { await hook.result.current.clear.mutateAsync(G1); });
    expect(apiClient.delete).toHaveBeenCalledWith(`/api/channels/thumbnail-executions/failed/${G1}`);
    await waitFor(() => expect(hook.result.current.list.data?.[0]?.registrationStatus).toBe('registered'));
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('marks a checking execution as not applied and reads the status again, which opens a new upload', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ generationId: G1, executionId: 'e1', success: false, screenshotPath: null });
    const hook = mount();
    await waitFor(() => expect(hook.result.current.list.data?.[0]?.registrationExecutionId).toBe('e1'));

    executionStatus = 'failed';
    await act(async () => { await hook.result.current.notApplied.mutateAsync('e1'); });
    expect(apiClient.post).toHaveBeenCalledWith('/api/channels/thumbnail-executions/e1/not-applied', {});
    await waitFor(() => expect(hook.result.current.list.data?.[0]?.registrationStatus).toBe('failed'));
  });
});
