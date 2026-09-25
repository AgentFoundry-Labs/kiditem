import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrendCollectionViews } from './TrendCollectionViews';

const operationMocks = vi.hoisted(() => ({
  start: vi.fn(),
  cancelInExtension: vi.fn(),
  list: vi.fn(),
  cancelOnServer: vi.fn(),
}));
const trendMocks = vi.hoisted(() => ({
  fetch1688HotProducts: vi.fn(),
  fetchNaverKeywordTrends: vi.fn(),
  fetchPopularKeywordBoards: vi.fn(),
  fetchShortsTrends: vi.fn(),
  fetchTiktokCcTrends: vi.fn(),
}));

vi.mock('./LiveCommerceSection', () => ({
  LiveCommerceSection: () => <div>persisted-live-commerce-snapshot</div>,
}));

vi.mock('../lib/trend-collection-api', () => ({
  fetch1688HotProducts: trendMocks.fetch1688HotProducts,
  fetchNaverKeywordTrends: trendMocks.fetchNaverKeywordTrends,
  fetchPopularKeywordBoards: trendMocks.fetchPopularKeywordBoards,
  fetchShortsTrends: trendMocks.fetchShortsTrends,
  fetchTiktokCcTrends: trendMocks.fetchTiktokCcTrends,
}));

vi.mock('@/lib/operation-start', () => ({
  requestOperationStart: operationMocks.start,
  requestOperationCancel: operationMocks.cancelInExtension,
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (path: string) => operationMocks.list(path),
    post: (path: string) => operationMocks.cancelOnServer(path),
  },
}));

vi.mock('../lib/live-commerce-api', () => ({
  fetchLiveCommerceKeywords: vi.fn(async () => ({ keywords: [] })),
}));

function renderViews() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TrendCollectionViews />
    </QueryClientProvider>,
  );
}

function persistedSnapshot() {
  return {
    regions: [{
      region: 'US',
      items: [{
        trendType: 'keyword',
        entityKey: 'persisted-tiktok',
        label: '보존된 틱톡 스냅샷',
        rank: 1,
        newlyRanked: false,
        growthPct: null,
        sourceUrl: null,
      }],
    }],
    capturedAt: '2026-08-14T00:00:00.000Z',
  };
}

function tiktokOperation(
  id: string,
  status: 'executing' | 'succeeded' | 'failed' | 'cancelled',
  patch: Record<string, unknown> = {},
) {
  return {
    id,
    kind: 'sourcing.tiktok_creative',
    status,
    lockKeys: ['resource:tiktok:creative'],
    plan: { sourceKey: 'tiktok.creative' },
    progress: null,
    result: null,
    window: null,
    errorCode: status === 'cancelled' ? 'USER_CANCELLED' : null,
    errorMessage: null,
    startedAt: '2026-09-04T00:00:00.000Z',
    finishedAt: status === 'executing' ? null : '2026-09-04T00:00:00.000Z',
    expiresAt: '2026-09-04T00:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...patch,
  };
}

describe('TrendCollectionViews TikTok direct source-owner collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trendMocks.fetch1688HotProducts.mockResolvedValue({ offers: [], capturedAt: null });
    trendMocks.fetchNaverKeywordTrends.mockResolvedValue({ keywords: [] });
    trendMocks.fetchPopularKeywordBoards.mockResolvedValue({ boards: [] });
    trendMocks.fetchShortsTrends.mockResolvedValue({ items: [] });
    trendMocks.fetchTiktokCcTrends.mockResolvedValue(persistedSnapshot());
    operationMocks.list.mockResolvedValue({ operations: [] });
    operationMocks.start.mockResolvedValue({ outcome: 'started', operationId: '00000000-0000-4000-8000-000000000777' });
    // 이 브라우저에는 그 실행이 없다 — 중단은 서버 cancel로 간다.
    operationMocks.cancelInExtension.mockRejectedValue(new Error('no extension run'));
  });

  it('keeps the persisted snapshot on mount, starts only from the CTA, and refetches the snapshot after a new success', async () => {
    renderViews();

    expect(screen.getByText('persisted-live-commerce-snapshot')).toBeInTheDocument();
    expect(await screen.findByText('보존된 틱톡 스냅샷')).toBeInTheDocument();
    expect(operationMocks.start).not.toHaveBeenCalled();
    await waitFor(() => expect(operationMocks.list).toHaveBeenCalledWith('/api/operations?kinds=sourcing.tiktok_creative&limit=20'));

    operationMocks.list.mockResolvedValue({ operations: [tiktokOperation('00000000-0000-4000-8000-000000000777', 'succeeded')] });
    fireEvent.click(screen.getByRole('button', { name: '틱톡 수집' }));

    await waitFor(() => expect(operationMocks.start).toHaveBeenCalledWith('sourcing.tiktok_creative', {}, { capability: 'sourcingOperationKindsV1' }));
    await waitFor(() => expect(trendMocks.fetchTiktokCcTrends).toHaveBeenCalledTimes(2));
    expect(screen.getByText('보존된 틱톡 스냅샷')).toBeInTheDocument();
  });

  it('shows the running TikTok collection with a stop that ends it through the operation cancel, then shows it stopped', async () => {
    const operationId = '00000000-0000-4000-8000-000000000778';
    operationMocks.list.mockResolvedValue({ operations: [tiktokOperation(operationId, 'executing')] });
    operationMocks.cancelOnServer.mockImplementation(async () => {
      operationMocks.list.mockResolvedValue({ operations: [tiktokOperation(operationId, 'cancelled')] });
    });
    renderViews();

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByText('수집을 중단했습니다. 저장된 완료본은 유지됩니다.')).toBeInTheDocument();
    expect(operationMocks.cancelInExtension).toHaveBeenCalledWith(operationId);
    expect(operationMocks.cancelOnServer).toHaveBeenCalledWith(`/api/operations/${operationId}/cancel`);
    expect(operationMocks.start).not.toHaveBeenCalled();
    expect(screen.getByText('보존된 틱톡 스냅샷')).toBeInTheDocument();
  });

  it('shows a failed collection and the last success cutoff without hiding the previous snapshot', async () => {
    operationMocks.list.mockResolvedValue({ operations: [
      tiktokOperation('00000000-0000-4000-8000-000000000777', 'failed', {
        errorCode: 'SITE_REQUEST_FAILED',
        errorMessage: '틱톡 크리에이티브 센터 요청이 실패했습니다(503).',
      }),
      tiktokOperation('00000000-0000-4000-8000-000000000776', 'succeeded', { result: { windowEndAt: '2026-09-03T01:00:00.000Z' } }),
    ] });
    renderViews();

    expect(await screen.findByText(/틱톡 크리에이티브 센터 요청이 실패했습니다/)).toBeInTheDocument();
    expect(screen.getByText(/최근 완료 기준/)).toBeInTheDocument();
    expect(screen.getByText('보존된 틱톡 스냅샷')).toBeInTheDocument();
  });

  it('contains no TikTok Operation hook, panel, or legacy operation key', async () => {
    const source = await readFile(resolve(
      process.cwd(),
      'src/app/(sourcing-ai)/sourcing-ai/market/components/TrendCollectionViews.tsx',
    ), 'utf8');
    expect(source).not.toContain('useSourcingOperationAction');
    expect(source).not.toContain('SourcingOperationRunPanel');
    expect(source).not.toContain('sourcing.collect_tiktok_cc_trends');
  });
});

describe('TrendCollectionViews Naver popular boards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trendMocks.fetch1688HotProducts.mockResolvedValue({ offers: [], capturedAt: null });
    trendMocks.fetchNaverKeywordTrends.mockResolvedValue({ keywords: [] });
    trendMocks.fetchShortsTrends.mockResolvedValue({ items: [] });
    trendMocks.fetchTiktokCcTrends.mockResolvedValue(persistedSnapshot());
    operationMocks.list.mockResolvedValue({ operations: [] });
  });

  function rankedBoard(comparedFrom: string | null) {
    return {
      boardKey: 'toys_dolls',
      boardLabel: '완구',
      latest: [{ rank: 1, keyword: '레고' }],
      comparedFrom,
      risers: [],
    };
  }

  it('shows a board with no earlier day to compare as unmeasured, not as no rise signal', async () => {
    trendMocks.fetchPopularKeywordBoards.mockResolvedValue({ days: 7, boards: [rankedBoard(null)] });
    renderViews();

    expect(await screen.findByText('비교할 이전 순위일 없음')).toBeInTheDocument();
    expect(screen.queryByText('범위 내 상승 신호 없음')).not.toBeInTheDocument();
  });

  it('keeps a compared board without a riser as a measured absence', async () => {
    trendMocks.fetchPopularKeywordBoards.mockResolvedValue({ days: 7, boards: [rankedBoard('2026-09-08')] });
    renderViews();

    expect(await screen.findByText('범위 내 상승 신호 없음')).toBeInTheDocument();
    expect(screen.queryByText('비교할 이전 순위일 없음')).not.toBeInTheDocument();
  });
});
