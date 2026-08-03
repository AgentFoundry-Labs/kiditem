import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductsPageContent from './ProductsPageContent';
import type { MasterProductOperationsListResponse } from '@kiditem/shared/product-operations';

const state = vi.hoisted(() => ({
  abcGrade: '',
  dataStatusOpen: false,
  activeStatus: 'active' as const,
  adStatus: 'all' as const,
  category: '',
  data: {
    items: [{
      id: '11111111-1111-4111-8111-111111111111',
      code: 'KI-001',
      displayReference: { type: 'product_code' as const, label: '상품 코드', value: 'KI-001' },
      name: '스테이지 상품',
      description: null,
      category: '완구/놀이',
      brand: 'KidItem',
      tags: ['핵심'],
      imageUrls: [],
      displayImageUrls: [],
      abcGrade: 'A',
      abcEvaluation: null,
      profitTag: null,
      adTier: null,
      adBudgetLimit: null,
      healthScore: 82,
      healthUpdatedAt: null,
      isActive: true,
      updatedAt: '2026-07-16T01:00:00.000Z',
      depletion: {
        coverage: 'shared' as const,
        needsReorder: true,
        reorderSkuCount: 1,
        minMonthsOfAvailableStockLeft: 0.5,
      },
      channelOptionSummary: { total: 2, active: 2, configured: 1, warning: 1 },
      inventoryUnits: 17,
      inventoryStatus: 'configuration_required' as const,
      channelCount: 1,
      channelStatus: 'partial' as const,
      traffic: null,
      visitorCount: null,
      viewCount: null,
      cartAddCount: null,
      orderCount: 4,
      salesQuantity: null,
      salesAmount: 35_000,
      adSpend: null,
      adSpendRate: null,
      metricsFreshness: {
        traffic: { status: 'MISSING' as const, coverageStartDate: null, coverageEndDate: null, capturedAt: null },
        advertising: { status: 'MISSING' as const, coverageStartDate: null, coverageEndDate: null, capturedAt: null },
      },
      profit: null,
      contributionProfitVelocity30: null,
      contributionMargin: null,
    }],
    total: 126,
    page: 2,
    limit: 50,
    summary: {
      abcGradeCounts: { A: 37, B: 29, C: 50, unclassified: 10 },
      abcStatusCounts: {
        READY: 104,
        INSUFFICIENT_EVIDENCE: 4,
        SOURCE_UNMAPPED: 0,
        CALIBRATION_PENDING: 8,
        RECALCULATING: 0,
        SELLPIA_SOURCE_STALE: 0,
        AD_SOURCE_STALE: 0,
        ORDERS_SOURCE_STALE: 0,
        CALCULATION_ERROR: 0,
      },
      abcContributionProfitByGrade: { A: 12_000, B: 2_000, C: -500 },
      abcContributionProfitShareByGrade: { A: 0.89, B: 0.15, C: -0.04 },
      abcFormula: null,
      displayDataAsOf: '2026-07-31',
      channelConnectionCounts: { connected: 120, unconnected: 6 },
      inventoryStatusCounts: {
        sellable: 81,
        partial_out_of_stock: 7,
        out_of_stock: 9,
        configuration_required: 15,
        review_required: 14,
      },
      negativeProfitCount: 8,
      reorderProductCount: 12,
      depletionCoveredProductCount: 54,
      sharedDepletionProductCount: 7,
    },
  },
  overviewData: undefined as MasterProductOperationsListResponse | undefined,
  overviewErrorMessage: null as string | null,
  errorMessage: null as string | null,
  goToPage: vi.fn(),
  handleSearch: vi.fn((event: { preventDefault: () => void }) => event.preventDefault()),
  inventoryStatus: 'all' as const,
  isFetching: false,
  isLoading: false,
  isPlaceholderData: false,
  page: 2,
  periodDays: 30 as const,
  refetch: vi.fn(),
  search: '',
  setAbcGrade: vi.fn(),
  setDataStatusOpen: vi.fn(),
  setActiveStatus: vi.fn(),
  setAdStatus: vi.fn(),
  setCategory: vi.fn(),
  setInventoryStatus: vi.fn(),
  setPeriodDays: vi.fn(),
  setSearch: vi.fn(),
  totalPages: 3,
}));
const defaultData = state.data;
state.overviewData = defaultData;

vi.mock('../hooks/useProductHubPageState', () => ({
  PAGE_SIZE: 50,
  useProductHubPageState: () => state,
}));

vi.mock('./ProductEditorDialog', () => ({
  ProductEditorDialog: ({ open }: { open: boolean }) => open ? <div role="dialog">상품 만들기</div> : null,
}));

vi.mock('./ProductAbcDetailDialog', () => ({
  ProductAbcDetailDialog: ({ open, product }: { open: boolean; product: { name: string } | null }) => open ? <div role="dialog">{product?.name} ABC 평가 근거</div> : null,
}));

vi.mock('./ProductOperationsDataStatusAction', () => ({
  ProductOperationsDataStatusAction: ({ displayDataAsOf }: { displayDataAsOf: string | null }) => <button type="button">{displayDataAsOf ? `데이터 기준 ${displayDataAsOf}` : '데이터 기준 없음'}</button>,
}));

vi.mock('@/app/(inventory)/_shared/SellpiaSyncAction', () => ({
  SellpiaSyncAction: () => <button type="button">재고 동기화</button>,
}));

describe('<ProductsPageContent>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.data = defaultData;
    state.overviewData = defaultData;
    state.overviewErrorMessage = null;
    state.errorMessage = null;
  });

  it('preserves the staged product operations composition with MasterProduct rows', () => {
    render(<ProductsPageContent headingLevel={1} />);

    expect(screen.getByRole('heading', { level: 1, name: '상품 운영 센터' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '재고 동기화' })).toBeInTheDocument();
    expect(screen.getByText('매출 · 광고 · 재고 · 수익성 통합 관리')).toBeInTheDocument();
    expect(screen.getByText('카탈로그 상품 전체')).toBeInTheDocument();
    expect(screen.getByText('채널 연결')).toBeInTheDocument();
    expect(screen.getByText('채널 미연결')).toBeInTheDocument();
    expect(screen.queryByText('현재 페이지 채널 연결')).not.toBeInTheDocument();
    const catalogCard = screen.getByText('카탈로그 상품 전체').closest('article');
    expect(catalogCard).not.toBeNull();
    expect(within(catalogCard!).getByText('A등급')).toBeInTheDocument();
    expect(within(catalogCard!).getByText('B등급')).toBeInTheDocument();
    expect(within(catalogCard!).getByText('C등급')).toBeInTheDocument();
    expect(within(catalogCard!).getByText('미분류')).toBeInTheDocument();
    expect(within(catalogCard!).getByText('37')).toBeInTheDocument();
    expect(within(catalogCard!).getByText('10')).toBeInTheDocument();
    expect(within(catalogCard!).getByText('120')).toBeInTheDocument();
    expect(within(catalogCard!.querySelector('div.grid')!).getByText('6')).toBeInTheDocument();
    expect(within(catalogCard!).queryByText(/현재 페이지 A등급/)).not.toBeInTheDocument();
    expect(screen.getByText('재고관리')).toBeInTheDocument();
    expect(screen.getByText('임박 재고')).toBeInTheDocument();
    expect(screen.getByText('발주 필요')).toBeInTheDocument();
    expect(screen.getByText('손익점검')).toBeInTheDocument();
    expect(screen.getByText('점검 대상')).toBeInTheDocument();
    expect(screen.getByText('A등급 이익')).toBeInTheDocument();
    expect(screen.getByText('B등급 이익')).toBeInTheDocument();
    expect(screen.getByText('데이터 기준 2026-07-31')).toBeInTheDocument();
    expect(screen.getByText('알림')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전체 카테고리' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '완구/놀이' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '상품' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '재고' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '매출' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '광고비율' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '미분류' })).toHaveValue('unclassified');
    expect(screen.queryByRole('combobox', { name: 'ABC 상태' })).not.toBeInTheDocument();
    expect(screen.getByText('스테이지 상품')).toBeInTheDocument();
    expect(screen.getByText(/KI-001/)).toBeInTheDocument();
    expect(screen.getAllByText('재고 연결 필요').length).toBeGreaterThan(0);
    expect(screen.getByText(/공유 SKU 기준/)).toBeInTheDocument();
    const inventoryCard = screen.getByText('재고관리').closest('article');
    expect(inventoryCard).not.toBeNull();
    expect(within(inventoryCard!).getByText('기준 미정')).toBeInTheDocument();
    expect(inventoryCard).not.toHaveTextContent('17');
  });

  it('shows a channel product number instead of a CP UUID for channel-origin products', () => {
    state.data = {
      ...defaultData,
      items: [{
        ...defaultData.items[0],
        code: 'CP-11111111-1111-4111-8111-111111111111',
        displayReference: {
          type: 'channel_product',
          label: 'Coupang Wing 상품번호',
          value: '13712531060',
        },
      }],
    };

    render(<ProductsPageContent headingLevel={1} />);

    expect(screen.getByText(/Coupang Wing 상품번호 13712531060/)).toBeInTheDocument();
    expect(screen.queryByText(/CP-11111111/)).not.toBeInTheDocument();
  });

  it('keeps the staged header and enables period, category, and product creation controls without ABC policy controls', () => {
    render(<ProductsPageContent headingLevel={1} />);

    expect(screen.getByRole('button', { name: '데이터 기준 2026-07-31' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '트래픽 업로드' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '7일' }));
    expect(state.setPeriodDays).toHaveBeenCalledWith(7);
    fireEvent.click(screen.getByRole('button', { name: '완구/놀이' }));
    expect(state.setCategory).toHaveBeenCalledWith('완구/놀이');
    fireEvent.click(screen.getByRole('button', { name: '+ 상품 추가' }));
    expect(screen.getByRole('dialog', { name: '' })).toHaveTextContent('상품 만들기');
    expect(screen.queryByRole('button', { name: '자동 ABC 정책' })).not.toBeInTheDocument();
  });

  it('uses full-result operating summaries without a duplicate out-of-stock action', () => {
    render(<ProductsPageContent headingLevel={1} />);

    expect(screen.queryByText(/현재 페이지/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /품절 상품/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /재고위험/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('재고위험').length).toBeGreaterThan(0);
    expect(screen.getAllByText('9').length).toBeGreaterThan(0);
    expect(screen.getAllByText('29').length).toBeGreaterThan(0);
    expect(screen.getAllByText('8').length).toBeGreaterThan(0);
  });

  it('filters the product list by unclassified automatic ABC results', () => {
    render(<ProductsPageContent headingLevel={1} />);

    fireEvent.change(screen.getByRole('combobox', { name: '상품 등급' }), {
      target: { value: 'unclassified' },
    });

    expect(state.setAbcGrade).toHaveBeenCalledWith('unclassified');
  });

  it('routes automatic ABC grade summaries without exposing calculation-state filters', () => {
    render(<ProductsPageContent headingLevel={1} />);

    fireEvent.click(screen.getByRole('button', { name: 'A등급 상품 보기' }));
    expect(state.setAbcGrade).toHaveBeenCalledWith('A');
    expect(screen.queryByRole('button', { name: '관찰 중 상품 보기' })).not.toBeInTheDocument();
  });

  it('opens the row evaluation evidence without fetching another product payload', () => {
    render(<ProductsPageContent headingLevel={1} />);

    fireEvent.click(screen.getByRole('button', { name: '스테이지 상품 ABC 근거 보기' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('스테이지 상품 ABC 평가 근거');
  });

  it('keeps overview metrics global while filters change only the product list result', () => {
    state.data = {
      ...defaultData,
      total: 9,
      summary: {
        ...defaultData.summary,
        abcGradeCounts: { A: 1, B: 2, C: 5, unclassified: 1 },
        channelConnectionCounts: { connected: 8, unconnected: 1 },
      },
    };
    state.overviewData = defaultData;

    render(<ProductsPageContent headingLevel={1} />);

    const catalogCard = screen.getByText('카탈로그 상품 전체').closest('article');
    expect(catalogCard).not.toBeNull();
    expect(within(catalogCard!).getByText('126')).toBeInTheDocument();
    expect(within(catalogCard!).getByText('120')).toBeInTheDocument();
    expect(screen.getByText('9개 표시')).toBeInTheDocument();
  });

  it('shows a load error without also claiming a valid empty result', () => {
    state.data = { ...defaultData, items: [], total: 0 };
    state.errorMessage = '상품 목록 실패';

    render(<ProductsPageContent headingLevel={1} />);

    expect(screen.getByText('상품 목록 실패')).toBeInTheDocument();
    expect(screen.queryByText('조건에 맞는 KidItem 상품이 없습니다.')).not.toBeInTheDocument();
  });
});
