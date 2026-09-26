import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCompetitorTrackingOverview } from '../lib/competitor-tracking-api';
import { CompetitorTrackingPage } from './CompetitorTrackingPage';

const mocks = vi.hoisted(() => ({ start: vi.fn(), cancelInExtension: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/operation-start', () => ({
  requestOperationStart: mocks.start,
  requestOperationCancel: mocks.cancelInExtension,
}));
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: async (path: string) => {
      const kind = /kinds=([^&]+)/.exec(path)?.[1];
      if (kind) return { operations: operations[kind] ?? [] };
      throw new Error(`unexpected GET ${path}`);
    },
    post: (path: string) => mocks.post(path),
  },
}));
vi.mock('../lib/competitor-tracking-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/competitor-tracking-api')>();
  return { ...actual, fetchCompetitorTrackingOverview: vi.fn() };
});

const CATALOG = 'advertising.competitor_catalog';
const IDENTITY = 'advertising.competitor_seller_identity';
const RUN_ID = '10000000-0000-4000-8000-000000000001';
let operations: Record<string, unknown[]>;

function operation(kind: string, status: 'executing' | 'succeeded' | 'failed' | 'cancelled', patch: Record<string, unknown> = {}) {
  return {
    id: RUN_ID, kind, status, lockKeys: status === 'executing' ? ['org'] : [], plan: { targets: [], productLimit: 100 }, progress: null, result: null,
    window: null, errorCode: status === 'cancelled' ? 'USER_CANCELLED' : null, errorMessage: null, startedAt: '2026-09-26T00:00:00.000Z',
    finishedAt: status === 'executing' ? null : '2026-09-26T00:05:00.000Z', expiresAt: '2026-09-26T00:30:00.000Z', attempts: 1, maxAttempts: 1,
    scheduledFor: null, ...patch,
  };
}

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
  lastCapturedAt: '2026-09-04T00:00:00.000Z',
  products: [],
  catalog: null,
};

function overview() {
  return {
    periodDays: 30,
    collection: {
      ownProductCount: 1,
      wingProductCount: 1,
      storefrontProductCount: 1,
      trackerCount: 1,
      enabledTrackerCount: 1,
      serpSnapshotCount: 1,
      trackedKeywords: ['슬라임'],
      suggestedKeywords: [],
      watchedCompetitors: [],
      lastCapturedAt: '2026-09-04T00:00:00.000Z',
    },
    summary: {
      trackedSellerCount: 1,
      topSellerCount: 1,
      overlappingProductCount: 1,
      matchedOwnProductCount: 1,
      trackedKeywordCount: 1,
      unresolvedSellerProductCount: 0,
      lastCapturedAt: '2026-09-04T00:00:00.000Z',
    },
    sellers: [seller],
  };
}

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

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
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

describe('CompetitorTrackingPage competitor operations (KID-362)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    operations = {};
    vi.mocked(fetchCompetitorTrackingOverview).mockResolvedValue(overview());
    mocks.start.mockImplementation(async (kind: string) => {
      operations[kind] = [operation(kind, 'executing')];
      return { outcome: 'started', operationId: RUN_ID };
    });
    mocks.cancelInExtension.mockRejectedValue(new Error('no extension run'));
    mocks.post.mockImplementation(async () => {
      operations[CATALOG] = [operation(CATALOG, 'cancelled')];
      return {};
    });
  });

  it('starts an all-seller catalog operation from 판매자 수집·갱신', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '판매자 수집·갱신' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    expect(mocks.start.mock.calls[0]).toEqual([CATALOG, {}, { capability: 'advertisingKeywordOperationKindsV1' }]);
  });

  it('starts a seller-scoped catalog operation with only the seller id', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '판매자 A 수집' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    expect(mocks.start.mock.calls[0]).toEqual([CATALOG, { sellerId: 'seller_123' }, { capability: 'advertisingKeywordOperationKindsV1' }]);
  });

  it('shows the running collection with a stop that cancels on the server, then shows it stopped', async () => {
    operations[CATALOG] = [operation(CATALOG, 'executing')];
    renderPage();
    expect(await screen.findByText('새 경쟁 판매자 수집 진행 중입니다. 이전 완료 스냅샷은 계속 표시됩니다.')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));
    expect(await screen.findByText('수집을 중단했습니다. 저장된 완료본은 유지됩니다.')).toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledWith(`/api/operations/${RUN_ID}/cancel`);
  });

  it('shows the last failure in the operator sentence', async () => {
    operations[CATALOG] = [operation(CATALOG, 'failed', { errorCode: 'ADVERTISING_COLLECTION_INCOMPLETE', errorMessage: 'x' })];
    renderPage();
    expect(await screen.findByText(/마지막 수집 실패: 수집이 요청한 범위를 다 채우지 못했습니다/)).toBeInTheDocument();
  });

  it('offers 판매자 확인 when competitor products have no known seller and starts the identity operation', async () => {
    const base = overview();
    vi.mocked(fetchCompetitorTrackingOverview).mockResolvedValue({ ...base, summary: { ...base.summary, unresolvedSellerProductCount: 3 } });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '판매자 확인' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    expect(mocks.start.mock.calls[0]).toEqual([IDENTITY, {}, { capability: 'advertisingKeywordOperationKindsV1' }]);
  });
});

describe('CompetitorTrackingPage collection state from published counts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    operations = {};
  });

  function emptyOverview(counts: {
    ownProductCount: number;
    enabledTrackerCount: number;
    serpSnapshotCount: number;
  }) {
    const base = overview();
    return { ...base, collection: { ...base.collection, ...counts }, sellers: [] };
  }

  it('shows the own-catalog empty state when no own product was loaded', async () => {
    vi.mocked(fetchCompetitorTrackingOverview).mockResolvedValue(
      emptyOverview({ ownProductCount: 0, enabledTrackerCount: 1, serpSnapshotCount: 1 }),
    );
    renderPage();

    expect(await screen.findByText('자사 상품을 불러오지 못했습니다')).toBeInTheDocument();
  });

  it('asks to prepare tracking keywords when no tracker is enabled', async () => {
    vi.mocked(fetchCompetitorTrackingOverview).mockResolvedValue(
      emptyOverview({ ownProductCount: 1, enabledTrackerCount: 0, serpSnapshotCount: 3 }),
    );
    renderPage();

    expect(await screen.findByText('추적 키워드를 준비할게요')).toBeInTheDocument();
  });

  it('reports an uncollected period when trackers are enabled but no snapshot was read', async () => {
    vi.mocked(fetchCompetitorTrackingOverview).mockResolvedValue(
      emptyOverview({ ownProductCount: 1, enabledTrackerCount: 2, serpSnapshotCount: 0 }),
    );
    renderPage();

    expect(await screen.findByText('아직 경쟁 판매자 수집값이 없습니다')).toBeInTheDocument();
  });
});
