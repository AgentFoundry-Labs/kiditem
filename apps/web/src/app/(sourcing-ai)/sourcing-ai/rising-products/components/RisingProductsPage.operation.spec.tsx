import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useSourcingOperationAction } from '../../hooks/use-sourcing-operation-action';
import { RisingProductsPage } from './RisingProductsPage';

const mocks = vi.hoisted(() => ({
  start: vi.fn(async () => ({ id: '10000000-0000-4000-8000-000000000001' })),
  run: null as { status: string } | null,
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getNullable: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../../hooks/use-sourcing-operation-action', () => ({
  useSourcingOperationAction: vi.fn(() => ({
    run: mocks.run,
    start: mocks.start,
    cancel: vi.fn(),
    retryAttention: vi.fn(),
    isStarting: false,
    isCancelling: false,
    isRetrying: false,
  })),
}));

vi.mock('./RisingKeywordsPanel', () => ({
  RisingKeywordsPanel: () => <aside>rising keyword panel</aside>,
}));

vi.mock('../../components/SourcingOperationRunPanel', () => ({
  SourcingOperationRunPanel: ({ run }: { run: { status?: string } | null }) =>
    run ? <div>run:{run.status}</div> : null,
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

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RisingProductsPage />
    </QueryClientProvider>,
  );
}

describe('RisingProductsPage operation migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.run = null;
    vi.mocked(apiClient.getNullable).mockResolvedValue(result as never);
    vi.mocked(apiClient.get).mockResolvedValue([] as never);
  });

  it('reads persisted data on mount and starts exactly one snapshot operation on click', async () => {
    renderPage();

    await screen.findByText('저장된 급상승 스티커');
    expect(mocks.start).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '감지 실행' }));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    expect(mocks.start).toHaveBeenCalledWith();
    expect(useSourcingOperationAction).toHaveBeenLastCalledWith({
      operationKey: 'sourcing.detect_rising_products',
      input: { windowDays: 14 },
      snapshotQueryKey: queryKeys.sourcing.risingProducts(),
      wakeBrowserRuntime: false,
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('keeps the persisted snapshot visible beside a failed run panel', async () => {
    mocks.run = { status: 'failed' };

    renderPage();

    expect(await screen.findByText('저장된 급상승 스티커')).toBeInTheDocument();
    expect(screen.getByText('run:failed')).toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
