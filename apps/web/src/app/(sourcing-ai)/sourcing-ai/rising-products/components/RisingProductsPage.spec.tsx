import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { RisingProductsPage } from './RisingProductsPage';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getNullable: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const result = {
  businessDate: '2026-08-14',
  windowDays: 14,
  generatedAt: '2026-08-14T01:00:00.000Z',
  confidence: 0.75,
  dataGaps: [],
  model: {
    candidates: [{
      id: 'candidate-1',
      rank: 1,
      keyword: '스티커',
      vendorItemId: 'vendor-1',
      productId: 'product-1',
      productName: '저장된 급상승 스티커',
      productUrl: null,
      latestPriceKrw: 10_000,
      latestReviewCount: 100,
      latestRatingScore: 4.8,
      latestOrganicRank: 2,
      score: 88,
      grade: 'A',
      decision: 'order',
      components: { momentum: 80, freshness: 70, trendFit: 90, riskPenalty: 0 },
      signals: {
        spanDays: 7,
        observationDays: 3,
        firstSeenBusinessDate: '2026-08-08',
        daysSinceFirstSeen: 6,
        reviewGrowth: 50,
        reviewVelocityPerDay: 7,
        rankClimb: 4,
        salesLast28d: 120,
        salesVelocityPerDay: 4,
        hasWingSales: true,
        trendDelta: 20,
        monthlySearchVolume: 1_000,
      },
      reasons: [],
      risks: [],
      modelTags: [],
      sourceDate: '2026-08-14',
    }],
    stats: {
      candidateCount: 1,
      serpSnapshotCount: 2,
      keywordCount: 1,
      orderCount: 1,
      observeCount: 0,
      excludedCount: 0,
      withWingSalesCount: 1,
      insufficientHistoryCount: 0,
      averageScore: 88,
      topKeyword: '스티커',
    },
    model: {
      pipeline: 'rising',
      version: 1,
      generatorVersion: 'v1',
      weights: { momentum: 1, freshness: 1, trendFit: 1, riskPenalty: 1 },
    },
  },
};

const clients: QueryClient[] = [];
function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <RisingProductsPage />
    </QueryClientProvider>,
  );
}

describe('RisingProductsPage direct owner calculation', () => {
  afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.getNullable).mockResolvedValue(result as never);
    vi.mocked(apiClient.get).mockResolvedValue([] as never);
    vi.mocked(apiClient.post).mockResolvedValue(result);
  });

  it('reads persisted data on mount and calculates once with the original 14-day input on click', async () => {
    vi.mocked(apiClient.post).mockImplementation(() => new Promise(() => undefined));
    renderPage();

    await screen.findByText('저장된 급상승 스티커');
    expect(apiClient.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '감지 실행' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    expect(apiClient.post).toHaveBeenCalledWith('/api/sourcing/rising-products', { windowDays: 14 });
    expect(screen.getByRole('button', { name: '감지 실행' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('계산 중');
    expect(screen.getByText('저장된 급상승 스티커')).toBeInTheDocument();
  });

  it('keeps the saved result on calculation failure without retrying and reload performs only reads', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('calculation unavailable'));
    const page = renderPage();
    await screen.findByText('저장된 급상승 스티커');
    fireEvent.click(screen.getByRole('button', { name: '감지 실행' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('처리 중 문제가 생겼습니다');
    expect(screen.getByText('저장된 급상승 스티커')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '감지 실행' })).toBeEnabled();
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    page.unmount();
    renderPage();
    await screen.findByText('저장된 급상승 스티커');
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  it('refreshes the stored read after successful calculation without trusting a separate command result cache', async () => {
    vi.mocked(apiClient.post).mockImplementation(async () => {
      vi.mocked(apiClient.getNullable).mockResolvedValue({ ...result, model: { ...result.model, candidates: [] } });
      return result;
    });
    renderPage();
    await screen.findByText('저장된 급상승 스티커');
    fireEvent.click(screen.getByRole('button', { name: '감지 실행' }));
    expect(await screen.findByText('아직 급상승 후보가 없습니다')).toBeInTheDocument();
    expect(screen.queryByText('저장된 급상승 스티커')).not.toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });
});
