import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStartedGenerationProgress, type StartedGeneration } from './useStartedGenerationProgress';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));

const DETAIL_URL = '/api/ai/detail-page';
const THUMBNAIL_URL = '/api/ai/thumbnail-jobs?limit=100';

let detailStatus = 'processing';
let thumbnailStatus = 'running';

function serve() {
  api.get.mockImplementation(async (url: string) => {
    if (url === DETAIL_URL) {
      return [
        { id: 'detail-1', imageProcessingStatus: detailStatus },
        // 다른 곳에서 시작한 생성 — 이 화면은 이것을 보지 않는다.
        { id: 'detail-elsewhere', imageProcessingStatus: 'processing' },
      ];
    }
    if (url === THUMBNAIL_URL) {
      return { items: [{ id: 'thumbnail-1', status: thumbnailStatus }], total: 1 };
    }
    throw new Error(`unexpected get ${url}`);
  });
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
let client: QueryClient;

function started(overrides: Partial<StartedGeneration> = {}): StartedGeneration {
  return {
    salesProductId: 'sales-product-1',
    detailGenerationId: 'detail-1',
    thumbnailGenerationId: null,
    startedAt: 0,
    ...overrides,
  };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useStartedGenerationProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    detailStatus = 'processing';
    thumbnailStatus = 'running';
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    serve();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks nothing while the page has started nothing', async () => {
    renderHook(() => useStartedGenerationProgress([]), { wrapper });
    await advance(60_000);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('marks only the drafts whose generation this page started, matched by generation id', async () => {
    const { result } = renderHook(() => useStartedGenerationProgress([started()]), { wrapper });

    await waitFor(() => expect(result.current.runningSalesProductIds).toEqual(new Set(['sales-product-1'])));
    expect(result.current.runningDetailCount).toBe(1);
    expect(api.get).toHaveBeenCalledWith(DETAIL_URL);
  });

  it('stays within 4 requests a minute with one kind running and stops once it finishes', async () => {
    const { result } = renderHook(() => useStartedGenerationProgress([started()]), { wrapper });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));

    await advance(59_000);
    // 15초마다 한 번 — 0 · 15 · 30 · 45초.
    expect(api.get.mock.calls.length).toBe(4);

    detailStatus = 'completed';
    await advance(15_000);
    await waitFor(() => expect(result.current.runningSalesProductIds.size).toBe(0));
    const callsWhenDone = api.get.mock.calls.length;
    await advance(120_000);
    expect(api.get.mock.calls.length).toBe(callsWhenDone);
  });

  it('stays within 4 requests a minute with detail and thumbnail both running', async () => {
    const { result } = renderHook(
      () => useStartedGenerationProgress([started({ thumbnailGenerationId: 'thumbnail-1' })]),
      { wrapper },
    );
    await waitFor(() => expect(result.current.runningThumbnailCount).toBe(1));

    await advance(59_000);
    // 두 목록을 각각 30초마다 — 0 · 30초에 둘씩.
    expect(api.get.mock.calls.length).toBe(4);
    expect(api.get).toHaveBeenCalledWith(THUMBNAIL_URL);
  });
});
