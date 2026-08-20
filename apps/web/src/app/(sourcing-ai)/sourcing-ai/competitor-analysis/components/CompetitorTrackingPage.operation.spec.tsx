import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompetitorTrackingPage } from './CompetitorTrackingPage';
import { fetchCompetitorTrackingOverview, autoConfigureCompetitorTrackers } from '../lib/competitor-tracking-api';
import {
  detectCompetitorExtensionGate,
} from '../lib/competitor-extension';
import { useSourcingOperationAction } from '../../hooks/use-sourcing-operation-action';

const RUN_ID = '20000000-0000-4000-8000-000000000011';
const start = vi.fn(async () => ({ id: RUN_ID }));
let capturedOptions: Record<string, unknown> | null = null;

const seller = {
  sellerKey: 'seller-key-1',
  sellerName: '판매자 A',
  brandName: null,
  sellerId: 'seller_123',
  sellerStoreUrl: 'https://shop.coupang.com/seller_123',
  sellerResolved: true,
  watchlisted: true,
  discoverySource: 'user' as const,
  priorityScore: 10,
  overlapProductCount: 1,
  matchedOwnProductCount: 1,
  trackedKeywordCount: 1,
  top10Count: 1,
  organicExposureCount: 1,
  averageRank: 1,
  totalReviewCount: 10,
  recentChangeCount: 0,
  lastCapturedAt: '2026-08-14T00:00:00.000Z',
  products: [],
  catalog: null,
};

vi.mock('../lib/competitor-tracking-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/competitor-tracking-api')>();
  return {
    ...actual,
    fetchCompetitorTrackingOverview: vi.fn(async () => ({
      periodDays: 30,
      collection: {
        status: 'ready',
        ownProductCount: 1,
        wingProductCount: 1,
        storefrontProductCount: 1,
        storefrontStatus: 'ready',
        trackerCount: 1,
        enabledTrackerCount: 1,
        trackedKeywords: ['슬라임'],
        suggestedKeywords: [],
        watchedCompetitors: [],
        lastCapturedAt: '2026-08-14T00:00:00.000Z',
      },
      summary: {
        trackedSellerCount: 1,
        topSellerCount: 1,
        overlappingProductCount: 1,
        matchedOwnProductCount: 1,
        trackedKeywordCount: 1,
        unresolvedSellerProductCount: 0,
        lastCapturedAt: '2026-08-14T00:00:00.000Z',
      },
      sellers: [seller],
    })),
    autoConfigureCompetitorTrackers: vi.fn(),
  };
});

vi.mock('../lib/competitor-extension', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/competitor-extension')>();
  return {
    ...actual,
    detectCompetitorExtensionGate: vi.fn(async () => ({
      status: 'ready',
      extensionId: 'extension-id',
      version: '1.2.33',
    })),
  };
});

vi.mock('../../hooks/use-sourcing-operation-action', () => ({
  useSourcingOperationAction: vi.fn((options: Record<string, unknown>) => {
    capturedOptions = options;
    return {
      runId: null,
      run: null,
      runQuery: { data: null },
      start,
      cancel: vi.fn(),
      retryAttention: vi.fn(),
      isStarting: false,
      isCancelling: false,
      isRetrying: false,
    };
  }),
}));

vi.mock('../hooks/useCompetitorProductTracking', () => ({
  useCompetitorProductTracking: () => ({
    trackedProductIds: new Set<string>(),
    trackingProductId: null,
    trackingPending: false,
    trackProduct: vi.fn(),
  }),
}));

vi.mock('./CompetitorSellerList', () => ({
  CompetitorSellerList: ({ sellers, onCollectSeller }: {
    sellers: typeof seller[];
    onCollectSeller: (value: typeof seller) => void;
  }) => (
    <button type="button" onClick={() => onCollectSeller(sellers[0]!)}>
      판매자 A 수집
    </button>
  ),
}));

vi.mock('./CompetitorSellerDetail', () => ({
  CompetitorSellerDetail: () => <div>판매자 상세</div>,
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CompetitorTrackingPage />
    </QueryClientProvider>,
  );
}

describe('CompetitorTrackingPage browser operation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOptions = null;
    window.history.replaceState({}, '', `/sourcing-ai/competitor-analysis?operationRun=${RUN_ID}`);
  });

  it('reads the persisted overview and reconnects without starting collection', async () => {
    renderPage();

    await screen.findByText('판매자 상세');
    expect(fetchCompetitorTrackingOverview).toHaveBeenCalledWith(30);
    expect(start).not.toHaveBeenCalled();
    expect(autoConfigureCompetitorTrackers).not.toHaveBeenCalled();
    expect(detectCompetitorExtensionGate).toHaveBeenCalledTimes(1);
    expect(capturedOptions).toMatchObject({
      operationKey: 'advertising.collect_competitor_catalog',
      input: { target: 'configured_watchlist' },
      snapshotQueryKey: ['sourcing', 'competitors', 30],
      initialRunId: RUN_ID,
    });
  });

  it('starts one configured-watchlist operation from the explicit collection CTA', async () => {
    renderPage();
    await screen.findByText('판매자 상세');

    fireEvent.click(screen.getByRole('button', { name: '판매자 수집·갱신' }));

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start).toHaveBeenCalledWith(
      { target: 'configured_watchlist' },
      [['sourcing', 'competitors', 30]],
    );
    expect(autoConfigureCompetitorTrackers).not.toHaveBeenCalled();
  });

  it('starts one validated seller operation without sending its store URL', async () => {
    renderPage();
    await screen.findByText('판매자 상세');

    fireEvent.click(screen.getByRole('button', { name: '판매자 A 수집' }));

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start).toHaveBeenCalledWith(
      { target: 'seller_id', sellerId: 'seller_123' },
      [['sourcing', 'competitors', 30]],
    );
    expect(JSON.stringify(start.mock.calls[0]?.[0])).not.toContain('sellerStoreUrl');
  });
});
