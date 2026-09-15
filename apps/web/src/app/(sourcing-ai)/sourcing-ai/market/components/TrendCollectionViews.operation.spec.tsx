import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrendCollectionViews } from './TrendCollectionViews';

const directOwnerMocks = vi.hoisted(() => ({
  collect: vi.fn(),
  fetchStatus: vi.fn(),
  cancel: vi.fn(),
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

vi.mock('../../lib/sourcing-tiktok-source-owner', () => ({
  collectSourcingTiktokCcTrendsFromExtension: directOwnerMocks.collect,
  fetchSourcingTiktokCcSourceStatus: directOwnerMocks.fetchStatus,
  cancelSourcingTiktokCcAttempt: directOwnerMocks.cancel,
}));

vi.mock('@/lib/browser-collection-session', () => ({
  // This browser holds no session for the attempt, so a stop reaches the owner route.
  sendBrowserCollectionControl: vi.fn(async () => {
    throw new Error('no extension session');
  }),
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

function readyStatus() {
  return {
    ready: true,
    latestAttempt: null,
    latestComplete: null,
    actualCutoffAt: null,
    errorCode: null,
    errorMessage: null,
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
    directOwnerMocks.fetchStatus.mockResolvedValue(readyStatus());
    directOwnerMocks.collect.mockResolvedValue({
      success: true,
      attemptId: '00000000-0000-4000-8000-000000000777',
      terminalState: 'COMPLETE',
    });
  });

  it('keeps the persisted snapshot on mount, starts only from the direct extension CTA, and refetches after COMPLETE', async () => {
    renderViews();

    expect(screen.getByText('persisted-live-commerce-snapshot')).toBeInTheDocument();
    expect(await screen.findByText('보존된 틱톡 스냅샷')).toBeInTheDocument();
    expect(directOwnerMocks.collect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '틱톡 수집' }));

    await waitFor(() => expect(directOwnerMocks.collect).toHaveBeenCalledTimes(1));
    expect(directOwnerMocks.collect).toHaveBeenCalledWith({ idempotencyKey: expect.any(String) });
    await waitFor(() => expect(trendMocks.fetchTiktokCcTrends).toHaveBeenCalledTimes(2));
    expect(screen.getByText('보존된 틱톡 스냅샷')).toBeInTheDocument();
  });

  it('reuses the same idempotency key after an uncertain extension failure while retaining the persisted snapshot', async () => {
    directOwnerMocks.collect
      .mockRejectedValueOnce(new Error('extension response lost'))
      .mockResolvedValueOnce({
        success: true,
        attemptId: '00000000-0000-4000-8000-000000000777',
        terminalState: 'COMPLETE',
      });
    renderViews();

    await screen.findByText('보존된 틱톡 스냅샷');
    fireEvent.click(screen.getByRole('button', { name: '틱톡 수집' }));
    await screen.findByText('extension response lost');
    expect(screen.getByText('보존된 틱톡 스냅샷')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '틱톡 수집' }));
    await waitFor(() => expect(directOwnerMocks.collect).toHaveBeenCalledTimes(2));
    expect(directOwnerMocks.collect.mock.calls[1][0].idempotencyKey)
      .toBe(directOwnerMocks.collect.mock.calls[0][0].idempotencyKey);
  });

  it('clears a pending key once source status confirms the asynchronously started attempt is terminal', async () => {
    directOwnerMocks.collect
      .mockResolvedValueOnce({
        success: false,
        attemptId: '00000000-0000-4000-8000-000000000777',
        terminalState: 'RUNNING',
      })
      .mockResolvedValueOnce({
        success: true,
        attemptId: '00000000-0000-4000-8000-000000000778',
        terminalState: 'COMPLETE',
      });
    directOwnerMocks.fetchStatus
      .mockResolvedValueOnce(readyStatus())
      .mockResolvedValueOnce({
        ...readyStatus(),
        latestAttempt: {
          attemptId: '00000000-0000-4000-8000-000000000777',
          state: 'COMPLETE',
          expiresAt: '2026-09-04T01:30:00.000Z',
          errorCode: null,
          errorMessage: null,
        },
      });
    renderViews();

    await screen.findByText('보존된 틱톡 스냅샷');
    fireEvent.click(screen.getByRole('button', { name: '틱톡 수집' }));
    await waitFor(() => expect(directOwnerMocks.fetchStatus).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: '틱톡 수집' }));
    await waitFor(() => expect(directOwnerMocks.collect).toHaveBeenCalledTimes(2));
    expect(directOwnerMocks.collect.mock.calls[1][0].idempotencyKey)
      .not.toBe(directOwnerMocks.collect.mock.calls[0][0].idempotencyKey);
  });

  it('shows the running TikTok collection with a stop that ends it through its owner, then shows it stopped', async () => {
    const attemptId = '00000000-0000-4000-8000-000000000778';
    const status = (state: 'RUNNING' | 'FAILED') => ({
      ready: true,
      latestAttempt: {
        attemptId,
        state,
        expiresAt: '2099-01-01T00:00:00.000Z',
        errorCode: state === 'FAILED' ? 'USER_CANCELLED' : null,
        errorMessage: state === 'FAILED' ? '운영자가 수집을 중단했습니다.' : null,
      },
      latestComplete: null,
      actualCutoffAt: null,
      errorCode: null,
      errorMessage: null,
    });
    directOwnerMocks.fetchStatus.mockResolvedValue(status('RUNNING'));
    directOwnerMocks.cancel.mockImplementation(async () => {
      directOwnerMocks.fetchStatus.mockResolvedValue(status('FAILED'));
    });
    renderViews();

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByText('수집을 중단했습니다. 저장된 완료본은 유지됩니다.')).toBeInTheDocument();
    expect(directOwnerMocks.cancel).toHaveBeenCalledWith(attemptId);
    expect(directOwnerMocks.collect).not.toHaveBeenCalled();
    expect(screen.getByText('보존된 틱톡 스냅샷')).toBeInTheDocument();
  });

  it('shows stale source failure and its actual cutoff without hiding the previous snapshot', async () => {
    directOwnerMocks.fetchStatus.mockResolvedValue({
      ready: false,
      latestAttempt: {
        attemptId: '00000000-0000-4000-8000-000000000777',
        state: 'FAILED',
        expiresAt: '2026-09-04T01:30:00.000Z',
        errorCode: 'ATTEMPT_EXPIRED',
        errorMessage: 'TikTok source attempt expired.',
      },
      latestComplete: {
        attemptId: '00000000-0000-4000-8000-000000000776',
        completedAt: '2026-09-03T01:00:00.000Z',
      },
      actualCutoffAt: '2026-09-03T01:00:00.000Z',
      errorCode: 'ATTEMPT_EXPIRED',
      errorMessage: 'TikTok source attempt expired.',
    });
    renderViews();

    expect(await screen.findByText('TikTok source attempt expired.')).toBeInTheDocument();
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
    directOwnerMocks.fetchStatus.mockResolvedValue(readyStatus());
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

    expect(await screen.findByText('이전 비교일 없음')).toBeInTheDocument();
    expect(screen.queryByText('범위 내 상승 신호 없음')).not.toBeInTheDocument();
  });

  it('keeps a compared board without a riser as a measured absence', async () => {
    trendMocks.fetchPopularKeywordBoards.mockResolvedValue({ days: 7, boards: [rankedBoard('2026-09-08')] });
    renderViews();

    expect(await screen.findByText('범위 내 상승 신호 없음')).toBeInTheDocument();
    expect(screen.queryByText('이전 비교일 없음')).not.toBeInTheDocument();
  });
});
