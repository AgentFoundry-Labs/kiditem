import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalSourcingOverview } from './GlobalSourcingOverview';
import { TrendCollectionViews } from './TrendCollectionViews';

const mocks = vi.hoisted(() => ({
  useAction: vi.fn(),
  fetchNaverKeywordTrends: vi.fn(),
}));

vi.mock('@/hooks/use-trend-source-collection', () => ({
  useTrendSourceCollection: mocks.useAction,
}));

vi.mock('../lib/trend-collection-api', () => ({
  fetch1688HotProducts: vi.fn().mockResolvedValue({ offers: [], capturedAt: null }),
  fetchNaverKeywordTrends: mocks.fetchNaverKeywordTrends,
  fetchPopularKeywordBoards: vi.fn().mockResolvedValue({ boards: [] }),
  fetchShortsTrends: vi.fn().mockResolvedValue({ items: [], capturedAt: null, businessDate: null }),
  fetchTiktokCcTrends: vi.fn().mockResolvedValue({ regions: [], capturedAt: null }),
}));

vi.mock('./LiveCommerceSection', () => ({
  LiveCommerceSection: () => null,
}));

vi.mock('../lib/live-commerce-api', () => ({
  fetchLiveCommerceKeywords: vi.fn(async () => ({ keywords: [] })),
}));

vi.mock('../../lib/sourcing-tiktok-source-owner', () => ({
  collectSourcingTiktokCcTrendsFromExtension: vi.fn(),
  fetchSourcingTiktokCcSourceStatus: vi.fn().mockResolvedValue({
    ready: true, latestAttempt: null, latestComplete: null,
    actualCutoffAt: null, errorCode: null, errorMessage: null,
  }),
  cancelSourcingTiktokCcAttempt: vi.fn(),
}));

vi.mock('@/lib/browser-collection-session', () => ({
  sendBrowserCollectionControl: vi.fn(async () => {
    throw new Error('no extension session');
  }),
}));

/** One stored Naver keyword the overview keeps as a stationery/toy opportunity. */
const storedSnapshot = {
  days: 30,
  keywords: [{
    keyword: '슬라임 만들기',
    latest: {
      businessDate: '2026-09-23',
      monthlyTotalSearchCount: 12000,
      monthlyPcSearchCount: 2000,
      monthlyMobileSearchCount: 10000,
      competitionIndex: '중간',
      averageAdRank: null,
      trendRatio: 60,
      trendDelta: 5,
    },
    sparkline: [],
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchNaverKeywordTrends.mockResolvedValue(storedSnapshot);
  mocks.useAction.mockReturnValue({
    control: {
      state: 'idle', statusRead: 'current', running: null, canStop: false, notice: null,
      start: vi.fn(), stop: vi.fn(),
    },
    start: vi.fn(),
    isCollecting: false,
    error: null,
    actualCutoffAt: null,
  });
});

describe('Naver keyword snapshot shared between the market overview and the trend collection tab', () => {
  it('draws the stored keyword in the trend collection table after the overview read the same snapshot', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const overview = render(
      <QueryClientProvider client={queryClient}>
        <GlobalSourcingOverview />
      </QueryClientProvider>,
    );
    const korea = (await screen.findByRole('heading', { name: '한국 수요' })).closest('section')!;
    await waitFor(() => expect(korea).toHaveTextContent('슬라임 만들기'));
    overview.unmount();

    render(
      <QueryClientProvider client={queryClient}>
        <TrendCollectionViews />
      </QueryClientProvider>,
    );

    const table = (await screen.findByRole('heading', { name: '네이버 월검색량 상위 키워드' })).closest('section')!;
    await waitFor(() => expect(within(table).getByRole('cell', { name: '슬라임 만들기' })).toBeInTheDocument());
  });
});
