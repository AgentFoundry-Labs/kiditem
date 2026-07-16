import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductsPageContent from './ProductsPageContent';

const state = vi.hoisted(() => ({
  activeStatus: 'active' as const,
  data: {
    items: [{
      masterProductId: '11111111-1111-4111-8111-111111111111',
      code: 'SP-001',
      name: 'Sellpia 상품',
      optionName: '파랑',
      barcode: '880000000001',
      currentStock: 17,
      purchasePrice: 1200,
      salePrice: 2500,
      isActive: true,
      stockValue: 20400,
      lastImportRunId: '22222222-2222-4222-8222-222222222222',
      lastImportedAt: '2026-07-16T01:00:00.000Z',
    }],
    total: 126,
    page: 2,
    limit: 50,
    summary: {
      totalSkus: 126,
      inStockSkus: 102,
      outOfStockSkus: 24,
      totalUnits: 2_468,
      pricedAssetValue: 3_250_000,
      unpricedSkuCount: 7,
    },
    latestImport: null,
  },
  errorMessage: null as string | null,
  goToPage: vi.fn(),
  handleSearch: vi.fn((event: { preventDefault: () => void }) => event.preventDefault()),
  isFetching: false,
  isLoading: false,
  isPlaceholderData: false,
  page: 2,
  refetch: vi.fn(),
  search: '',
  setActiveStatus: vi.fn(),
  setSearch: vi.fn(),
  setStockStatus: vi.fn(),
  stockStatus: 'all' as const,
  totalPages: 3,
}));

vi.mock('../hooks/useProductHubPageState', () => ({
  PAGE_SIZE: 50,
  useProductHubPageState: () => state,
}));

vi.mock('./ChannelSkuInventorySummary', () => ({
  ChannelSkuInventorySummary: () => <section>채널 SKU 전체 현황</section>,
}));

describe('<ProductsPageContent> c9 catalog baseline', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the Sellpia read-only catalog shell instead of the operations center', () => {
    render(<ProductsPageContent />);

    expect(screen.getByRole('heading', { level: 1, name: '상품 카탈로그' })).toBeInTheDocument();
    expect(screen.getByText('Sellpia 재고 데이터 기준 · 읽기 전용')).toBeInTheDocument();
    expect(screen.queryByText('상품 운영 센터')).not.toBeInTheDocument();
    expect(screen.queryByText('매출 · 광고 · 재고 · 수익성 통합 관리')).not.toBeInTheDocument();
    expect(screen.getByText('채널 SKU 전체 현황')).toBeInTheDocument();
    expect(screen.getAllByText('Sellpia 상품').length).toBeGreaterThan(0);
    expect(screen.getByText('2,468')).toBeInTheDocument();
  });

  it('keeps the c9 header controls and compact Sellpia columns', () => {
    render(<ProductsPageContent />);

    expect(screen.getByRole('link', { name: 'Sellpia 가져오기' })).toHaveAttribute(
      'href',
      '/inventory-hub?tab=sellpia-sync',
    );
    expect(screen.getByRole('link', { name: '상품 매칭' })).toHaveAttribute(
      'href',
      '/product-hub/matching',
    );
    for (const heading of ['Sellpia 상품', '바코드', '매입가', '판매가', '현재 재고']) {
      expect(screen.getAllByText(heading).length).toBeGreaterThan(0);
    }
    expect(screen.queryByRole('button', { name: '트래픽 업로드' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ 상품 추가' })).not.toBeInTheDocument();
  });
});
