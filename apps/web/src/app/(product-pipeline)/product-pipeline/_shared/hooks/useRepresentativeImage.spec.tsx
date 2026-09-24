import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  useAdoptThumbnail,
  useClearRegistrationError,
  useMarkRegistrationNotApplied,
  useThumbnailExecutionStatuses,
  useThumbnailGallery,
} from './useRepresentativeImage';

// 서버 API 는 웹의 외부 경계라 apiClient 만 바꾼다.
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

const W1 = '00000000-0000-4000-8000-000000000001';
const SP1 = '00000000-0000-4000-8000-0000000000c1';
const SP2 = '00000000-0000-4000-8000-0000000000c2';
const A1 = '00000000-0000-4000-8000-0000000000b1';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('representative image of a content workspace', () => {
  it('reads the gallery of upload and AI assets of the workspace', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([{ id: A1, url: 'https://cdn.example.com/a.png', isCurrentThumbnail: true }]);
    const { result } = renderHook(() => useThumbnailGallery(W1), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(apiClient.get).toHaveBeenCalledWith(`/api/ai/content-workspaces/${W1}/thumbnail-gallery`);
  });

  it('adopts one asset as the workspace representative image by its id', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ id: A1, isCurrentThumbnail: true });
    const { result } = renderHook(() => useAdoptThumbnail(), { wrapper });

    await act(async () => { await result.current.mutateAsync({ contentWorkspaceId: W1, assetId: A1 }); });

    expect(apiClient.patch).toHaveBeenCalledWith(`/api/ai/content-workspaces/${W1}/current-thumbnail`, { assetId: A1 });
  });

  it('refreshes the channel listings after an adoption so screens reading listing images do not stay stale', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ id: A1, isCurrentThumbnail: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useAdoptThumbnail(), {
      wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });

    await act(async () => { await result.current.mutateAsync({ contentWorkspaceId: W1, assetId: A1 }); });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.channelListings.all });
  });
});

describe('mall representative image executions', () => {
  it('reads the latest execution of each sales product in one query', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ items: [] });
    renderHook(() => useThumbnailExecutionStatuses([SP1, SP2, SP1]), { wrapper });

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));
    expect(apiClient.get).toHaveBeenCalledWith(`/api/channels/thumbnail-executions?salesProductIds=${SP1},${SP2}`);
  });

  it('clears the failure of a sales product and marks a checking execution as not applied', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ dismissed: true });
    vi.mocked(apiClient.post).mockResolvedValue({ executionId: 'e1', success: false });
    const { result } = renderHook(() => ({ clear: useClearRegistrationError(), notApplied: useMarkRegistrationNotApplied() }), { wrapper });

    await act(async () => { await result.current.clear.mutateAsync(SP1); });
    await act(async () => { await result.current.notApplied.mutateAsync('e1'); });

    expect(apiClient.delete).toHaveBeenCalledWith(`/api/channels/thumbnail-executions/failed/${SP1}`);
    expect(apiClient.post).toHaveBeenCalledWith('/api/channels/thumbnail-executions/e1/not-applied', {});
  });
});
