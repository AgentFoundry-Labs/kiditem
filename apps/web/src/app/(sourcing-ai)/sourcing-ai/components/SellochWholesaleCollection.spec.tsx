import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SellochWholesaleCoupangMatches } from './SellochWholesaleCoupangMatches';
import { SellochWholesaleKeywordSearch } from './SellochWholesaleKeywordSearch';

const mocks = vi.hoisted(() => ({
  imageStatus: vi.fn(),
  imageSearch: vi.fn(),
  keywordStatus: vi.fn(),
  keywordSearch: vi.fn(),
}));

const keywordTargets = Array.from({ length: 6 }, (_, index) => ({
  id: `target-${index}`,
  targetType: 'keyword',
  keyword: `중국어 키워드 ${index + 1}`,
}));

const imageMatches = Array.from({ length: 24 }, (_, index) => ({
  id: `match-${index}`,
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

vi.mock('../lib/sourcing-recommendation-presenter', () => ({
  toTodayRecommendationRows: () => [],
}));

vi.mock('../lib/coupang-1688-matching', () => ({
  build1688SearchUrl: (keyword: string) => `https://s.1688.com/${keyword}`,
  buildCoupangImageSearchRows: () => imageMatches,
  buildImageSearchOffer: vi.fn(),
  scoreImageSearchOffer: () => null,
  selectBestImageSearchOffer: () => null,
}));

vi.mock('../lib/1688-image-search-api', () => ({
  get1688ImageSearchStatus: mocks.imageStatus,
  search1688ByImage: mocks.imageSearch,
}));

vi.mock('../lib/1688-keyword-search-api', () => ({
  get1688KeywordSearchStatus: mocks.keywordStatus,
  search1688ByKeyword: mocks.keywordSearch,
}));

vi.mock('../wing-catalog/lib/wing-catalog-extension', () => ({
  resolveCoupangCatalogImageUrl: (path: string | null) =>
    path ? `https://img.example.test${path}` : null,
}));

vi.mock('../keywords/components/InterestKeywordManager', () => ({
  InterestKeywordManager: () => <div>관심 키워드 관리</div>,
}));

vi.mock('./SellochWholesaleOfferGrid', () => ({
  SellochWholesaleOfferGrid: () => <div>offer grid</div>,
}));

describe('wholesale route-entry collection boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.imageStatus.mockResolvedValue({ configured: true });
    mocks.imageSearch.mockResolvedValue({ items: [] });
    mocks.keywordStatus.mockResolvedValue({ configured: true });
    mocks.keywordSearch.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps keyword capability checks read-only until 상위 6개 검색 is clicked', async () => {
    render(<SellochWholesaleKeywordSearch />);

    const button = await screen.findByRole('button', { name: '상위 6개 검색' });
    expect(mocks.keywordStatus).toHaveBeenCalledTimes(1);
    expect(mocks.keywordSearch).not.toHaveBeenCalled();

    fireEvent.click(button);
    await waitFor(() => expect(mocks.keywordSearch).toHaveBeenCalledTimes(6));
  });

  it('keeps image capability checks read-only until 전체 수집 is clicked', async () => {
    vi.useFakeTimers();
    render(<SellochWholesaleCoupangMatches />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocks.imageStatus).toHaveBeenCalledTimes(1);
    expect(mocks.imageSearch).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '전체 수집' })).toBeEnabled();
  });

  it('reports 24/24 image failures as failure instead of 수집 완료 24개', async () => {
    vi.useFakeTimers();
    mocks.imageSearch.mockRejectedValue(new Error('provider unavailable'));
    render(<SellochWholesaleCoupangMatches />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: '전체 수집' }));
    await act(async () => {
      await vi.runAllTimersAsync();
      await Promise.resolve();
    });

    expect(mocks.imageSearch).toHaveBeenCalledTimes(24);
    expect(screen.getByText('수집 실패 · 성공 0개 · 실패 24개')).toBeInTheDocument();
    expect(screen.queryByText('수집 완료 24개')).not.toBeInTheDocument();
  });
});
