import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SellochWholesaleCoupangMatches } from './SellochWholesaleCoupangMatches';
import { SellochWholesaleKeywordSearch } from './SellochWholesaleKeywordSearch';

const mocks = vi.hoisted(() => ({
  operationStart: vi.fn(),
  operationCancel: vi.fn(),
  operationRetry: vi.fn(),
  useOperation: vi.fn(),
  useResults: vi.fn(),
  run: null as null | { id: string; status: string },
}));

const keywordTargets = Array.from({ length: 12 }, (_, index) => ({
  id: `target-${index}`,
  targetType: 'keyword',
  keyword: `중국어 키워드 ${index + 1}`,
}));

const imageMatches = Array.from({ length: 24 }, (_, index) => ({
  id: `product-${index}::`,
  searchQuery: `검색어 ${index + 1}`,
  searchUrl: `https://s.1688.com/selloffer/offer_search.htm?keywords=${index + 1}`,
  targetSalePriceKrw: 15_900,
  coupangProduct: {
    productId: `product-${index}`,
    productName: `쿠팡 상품 ${index + 1}`,
    imagePath: `/image-${index}.jpg`,
    grade: 'A',
    keywords: [`키워드 ${index + 1}`],
    salesLast3d: 10,
    ratingCount: 20,
    score: 80,
  },
}));

const persistedSnapshot = {
  generatedAt: '2026-08-14T00:00:00.000Z',
  observations: [
    {
      keyword: '중국어 키워드 1',
      targetId: null,
      capturedAt: '2026-08-14T00:00:00.000Z',
      items: [persistedItem('persisted keyword offer')],
    },
    {
      keyword: '검색어 1',
      targetId: 'product-0::',
      capturedAt: '2026-08-14T00:00:00.000Z',
      items: [persistedItem('persisted image offer')],
    },
  ],
};

vi.mock('../hooks/use-sourcing-workspace', () => ({
  useSourcingRecommendations: () => ({ data: undefined }),
  useSourcingInterestTargets: () => ({
    data: keywordTargets,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useSaveSourcingInterestTarget: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useRemoveSourcingInterestTarget: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

vi.mock('../hooks/use-wholesale-1688-results', () => ({
  useWholesale1688Results: mocks.useResults,
}));

vi.mock('../hooks/use-sourcing-operation-action', () => ({
  useSourcingOperationAction: mocks.useOperation,
}));

vi.mock('./SourcingOperationRunPanel', () => ({
  SourcingOperationRunPanel: ({ run }: { run: { status?: string } | null }) => (
    <div>operation panel {run?.status ?? 'idle'}</div>
  ),
}));

vi.mock('../lib/sourcing-recommendation-presenter', () => ({
  toTodayRecommendationRows: () => [],
}));

vi.mock('../lib/coupang-1688-matching', () => ({
  build1688SearchUrl: (keyword: string) => `https://s.1688.com/${keyword}`,
  buildCoupangImageSearchRows: () => imageMatches,
  buildImageSearchOffer: (item: { title: string; sourceUrl: string }) => ({
    ...item,
    id: item.sourceUrl,
    matchScore: 80,
    landedCostKrw: null,
    estimatedProfitKrw: null,
    estimatedMarginRate: null,
  }),
  scoreImageSearchOffer: () => 80,
  selectBestImageSearchOffer: (offers: unknown[]) => offers[0] ?? null,
}));

vi.mock('../wing-catalog/lib/wing-catalog-presenter', () => ({
  resolveCoupangCatalogImageUrl: (path: string | null) =>
    path ? `https://img.example.test${path}` : null,
}));

vi.mock('../keywords/components/InterestKeywordManager', () => ({
  InterestKeywordManager: () => <div>관심 키워드 관리</div>,
}));

vi.mock('./SellochWholesaleOfferGrid', () => ({
  SellochWholesaleOfferGrid: ({ offers }: { offers: Array<{ title: string }> }) => (
    <div>{offers.map((offer) => offer.title).join(', ')}</div>
  ),
}));

describe('wholesale route-entry Operation boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.run = null;
    mocks.useResults.mockReturnValue({
      data: persistedSnapshot,
      isLoading: false,
      isFetching: false,
    });
    mocks.useOperation.mockImplementation(() => ({
      run: mocks.run,
      start: mocks.operationStart,
      cancel: mocks.operationCancel,
      retryAttention: mocks.operationRetry,
      isStarting: false,
      isCancelling: false,
      isRetrying: false,
    }));
  });

  it('starts one bounded keyword batch only from the explicit top-six CTA', () => {
    render(<SellochWholesaleKeywordSearch />);

    expect(mocks.operationStart).not.toHaveBeenCalled();
    expect(mocks.useOperation).toHaveBeenLastCalledWith(expect.objectContaining({
      operationKey: 'sourcing.search_1688_keyword_batch',
      input: {
        keywords: keywordTargets.slice(0, 6).map((target) => target.keyword),
      },
      wakeBrowserRuntime: true,
    }));

    fireEvent.click(screen.getByRole('button', { name: '상위 6개 검색' }));

    expect(mocks.operationStart).toHaveBeenCalledTimes(1);
  });

  it('starts one bounded image batch only from the explicit whole-collection CTA', () => {
    render(<SellochWholesaleCoupangMatches />);

    expect(mocks.operationStart).not.toHaveBeenCalled();
    expect(mocks.useOperation).toHaveBeenLastCalledWith(expect.objectContaining({
      operationKey: 'sourcing.match_wholesale_images',
      input: { targetIds: imageMatches.map((match) => match.id) },
      wakeBrowserRuntime: false,
    }));

    fireEvent.click(screen.getByRole('button', { name: '전체 수집' }));

    expect(mocks.operationStart).toHaveBeenCalledTimes(1);
  });

  it('keeps persisted keyword and image observations visible beside an active run', () => {
    mocks.run = { id: 'run-active', status: 'running' };
    const keywordView = render(<SellochWholesaleKeywordSearch />);

    expect(screen.getByText('persisted keyword offer')).toBeInTheDocument();
    expect(screen.getByText('operation panel running')).toBeInTheDocument();
    keywordView.unmount();

    render(<SellochWholesaleCoupangMatches />);
    expect(screen.getAllByText('persisted image offer')).not.toHaveLength(0);
    expect(screen.getByText('operation panel running')).toBeInTheDocument();
  });
});

function persistedItem(title: string) {
  return {
    offerId: null,
    title,
    priceCny: null,
    sourceUrl: `https://detail.1688.com/${encodeURIComponent(title)}`,
    imageUrl: null,
    score: 80,
    monthlySales: null,
    tradeScore: null,
    repurchaseRate: null,
    supplierName: null,
    salesText: null,
    supplierFactoryUrl: null,
    supplierTags: [],
    purchaseTags: [],
    minOrderQuantity: null,
    shippingFulfillmentRate: null,
    shippingPickupRate: null,
    shipFrom: null,
    serviceScore: null,
  };
}
