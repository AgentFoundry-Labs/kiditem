import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProductKeywordRankRow } from '../lib/rank-api';
import { fetchProductKeywordRanks } from '../lib/rank-api';
import ProductKeywordRankOverview from './ProductKeywordRankOverview';

vi.mock('../lib/rank-api', () => ({
  fetchProductKeywordRanks: vi.fn(),
}));

function rankRow(index: number): ProductKeywordRankRow {
  return {
    keyword: `키워드 ${index}`,
    keywordSource: 'product_name',
    keywordScore: null,
    recommendationReason: '상품명',
    automaticKeyword: `키워드 ${index}`,
    category: null,
    candidates: [],
    vendorItemId: `vendor-${index}`,
    groupedVendorItemIds: [],
    groupedOptionCount: 1,
    skuId: null,
    productName: `상품 ${index}`,
    abcGrades: ['A'],
    currentSalesRank: index,
    previousSalesRank: index + 1,
    rankChange: 1,
    salesLast28d: 1,
    viewsLast28d: 10,
    revenueLast28d: 1_000,
    conversionRate28d: 0.1,
    salePrice: 1_000,
    reviewCount: 0,
    collectedCount: 100,
    totalResults: 100,
    businessDate: '2026-07-17',
    capturedAt: '2026-07-17T00:00:00.000Z',
    status: 'rising',
    history: [],
  };
}

function renderOverview() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProductKeywordRankOverview />
    </QueryClientProvider>,
  );
}

describe('ProductKeywordRankOverview pagination', () => {
  it('keeps page controls centered while navigating a multi-page rank result', async () => {
    vi.mocked(fetchProductKeywordRanks).mockResolvedValue({
      periodDays: 30,
      summary: {
        productCount: 51,
        optionCount: 51,
        duplicateOptionCount: 0,
        representativeKeywordCount: 51,
        rankedCount: 51,
        top20Count: 20,
        risingCount: 51,
        fallingCount: 0,
        outOfRangeCount: 0,
        notCollectedCount: 0,
      },
      rows: Array.from({ length: 51 }, (_, index) => rankRow(index + 1)),
    });
    renderOverview();

    expect(await screen.findByText('상품 1')).toBeInTheDocument();
    const pagination = screen.getByRole('navigation', { name: '순위 결과 페이지' });
    expect(pagination).toHaveClass('relative', 'flex', 'items-center', 'justify-center');
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(await screen.findByText('상품 51')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });
});
