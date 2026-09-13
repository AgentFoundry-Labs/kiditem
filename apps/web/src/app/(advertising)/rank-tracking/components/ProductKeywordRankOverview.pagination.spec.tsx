import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fetchProductKeywordRanks } from '../lib/rank-api';
import ProductKeywordRankOverview from './ProductKeywordRankOverview';
import type { ProductKeywordRankRow } from '../lib/rank-api';

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

  it('does not show a movement when the declared previous business-day rank is absent', async () => {
    vi.mocked(fetchProductKeywordRanks).mockResolvedValue({
      periodDays: 30,
      summary: {
        productCount: 1,
        optionCount: 1,
        duplicateOptionCount: 0,
        representativeKeywordCount: 1,
        rankedCount: 1,
        top20Count: 1,
        risingCount: 0,
        fallingCount: 0,
        outOfRangeCount: 0,
        notCollectedCount: 0,
      },
      rows: [
        {
          ...rankRow(10),
          previousSalesRank: null,
        },
      ],
    });
    renderOverview();

    expect(await screen.findByText('비교 전')).toBeInTheDocument();
    expect(screen.queryByText('+99')).not.toBeInTheDocument();
  });

  it('keeps the current rank and movement numbers for consecutive observations', async () => {
    vi.mocked(fetchProductKeywordRanks).mockResolvedValue({
      periodDays: 30,
      summary: {
        productCount: 1,
        optionCount: 1,
        duplicateOptionCount: 0,
        representativeKeywordCount: 1,
        rankedCount: 1,
        top20Count: 1,
        risingCount: 1,
        fallingCount: 0,
        outOfRangeCount: 0,
        notCollectedCount: 0,
      },
      rows: [rankRow(8)],
    });
    renderOverview();

    const row = (await screen.findByText('상품 8')).closest('tr');
    expect(row).toHaveTextContent('8위');
    expect(row).toHaveTextContent('+1');
  });
});
