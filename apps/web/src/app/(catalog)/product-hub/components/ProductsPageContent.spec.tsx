import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductsPageContent from './ProductsPageContent';

const state = vi.hoisted(() => ({
  activeStatus: 'active' as const,
  data: {
    items: [{
      masterProductId: '11111111-1111-4111-8111-111111111111',
      code: 'SP-001',
      name: '스테이지 상품',
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
    latestImport: {
      id: '22222222-2222-4222-8222-222222222222',
      fileName: 'sellpia.xlsx',
      fileHash: 'a'.repeat(64),
      status: 'completed' as const,
      rowCount: 1_968,
      importedAt: '2026-07-16T01:00:00.000Z',
      lastVerifiedAt: '2026-07-16T01:00:00.000Z',
      verificationCount: 1,
      lastTrigger: 'manual_request' as const,
      freshnessGeneration: '4',
      manualFreshExportConfirmedAt: null,
      manualFreshExportConfirmedBy: null,
      qualityReport: {
        issues: [{
          code: 'missing_barcode',
          severity: 'warning' as const,
          count: 7,
          sampleRowNumbers: [2],
          sampleProductCodes: ['SP-001'],
        }],
      },
      errorCode: null,
      errorMessage: null,
      createdAt: '2026-07-16T01:00:00.000Z',
      updatedAt: '2026-07-16T01:00:00.000Z',
    },
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

describe('<ProductsPageContent>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves the staged product operations center while reading current Sellpia snapshot data', () => {
    render(<ProductsPageContent headingLevel={1} />);

    expect(screen.getByRole('heading', { level: 1, name: '상품 운영 센터' })).toBeInTheDocument();
    expect(screen.getByText('매출 · 광고 · 재고 · 수익성 통합 관리')).toBeInTheDocument();
    expect(screen.getByText('카탈로그 상품 전체')).toBeInTheDocument();
    expect(screen.getByText('채널 연결')).toBeInTheDocument();
    expect(screen.getByText('채널 미연결')).toBeInTheDocument();
    expect(screen.getByText('A등급')).toBeInTheDocument();
    expect(screen.getByText('B등급')).toBeInTheDocument();
    expect(screen.getByText('C등급')).toBeInTheDocument();
    expect(screen.getByText('재고관리')).toBeInTheDocument();
    expect(screen.getByText('임박 재고')).toBeInTheDocument();
    expect(screen.getByText('발주 필요')).toBeInTheDocument();
    expect(screen.getByText('손익점검')).toBeInTheDocument();
    expect(screen.getByText('점검 대상')).toBeInTheDocument();
    expect(screen.getByText('적자상품')).toBeInTheDocument();
    expect(screen.getByText('이익률 3%↓')).toBeInTheDocument();
    expect(screen.getByText('핵심상품')).toBeInTheDocument();
    expect(screen.getByText('알림')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전체 카테고리' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '완구/놀이' })).toBeDisabled();
    expect(screen.getByRole('columnheader', { name: '상품' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '재고' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '매출' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '광고비율' })).toBeInTheDocument();
    expect(screen.getByText('스테이지 상품')).toBeInTheDocument();
    expect(screen.getByText(/SP-001/)).toBeInTheDocument();
    expect(screen.getByText('2,468')).toBeInTheDocument();
  });

  it('keeps the staged header shape and routes its upload icon to additive Sellpia sync', () => {
    render(<ProductsPageContent headingLevel={1} />);

    expect(screen.getByRole('button', { name: '트래픽 업로드' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ 상품 추가' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Sellpia 동기화' })).toHaveAttribute(
      'href',
      '/inventory-hub?tab=sellpia-sync',
    );
    expect(screen.queryByText('Sellpia 동기화')).not.toBeInTheDocument();
    expect(screen.queryByText('상품 매칭')).not.toBeInTheDocument();
    expect(screen.queryByText('채널 SKU 전체 현황')).not.toBeInTheDocument();
  });
});
