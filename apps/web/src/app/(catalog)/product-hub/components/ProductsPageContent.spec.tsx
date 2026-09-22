import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPeriodBasis,
  enumerateDashboardDates,
  type DashboardPeriodBasis,
} from '@kiditem/shared/dashboard';
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
      abcGrade: null,
      abcEvaluation: null,
      abc: {
        abcGrade: null,
        evaluation: null,
        formulaRevision: 2,
        publicationRevision: 4,
        officialCutoffDate: null,
        publishedAt: '2026-08-01T00:00:00.000Z',
        actualCutoffDate: null,
        sources: {
          sellpia: {
            ready: false,
            requiredCutoff: '2026-07-31',
            actualCutoff: null,
            latestAttempt: null,
            latestComplete: null,
          },
          advertising: {
            ready: false,
            requiredCutoff: '2026-07-31',
            actualCutoff: null,
            latestAttempt: null,
            latestComplete: null,
          },
          mapping: { valid: false, currentMappingGeneration: '0', evidenceMappingGeneration: null },
        },
      },
      contribution: null,
      adBudgetLimit: null,
      isActive: true,
      updatedAt: '2026-07-16T01:00:00.000Z',
      depletion: {
        coverage: 'shared' as const,
        needsReorder: true,
        reorderSkuCount: 1,
        monthlyOutflow: 4,
        outflowMonthCount: 2,
        minMonthsOfAvailableStockLeft: 0.5,
      },
      channelOptionSummary: { total: 2, active: 2, configured: 1, warning: 1 },
      inventoryUnits: 17,
      inventory: { skuCount: 0, measuredSkuCount: 0 },
      channelCount: 1,
      channelStatus: 'partial' as const,
      activeChannels: [{
        channelAccountId: '00000000-0000-4000-8000-000000000004',
        channel: 'coupang',
        channelAccountName: 'Coupang Wing',
      }],
      traffic: null,
      visitorCount: null,
      viewCount: null,
      cartAddCount: null,
      orderCount: 4,
      salesQuantity: null,
      salesAmount: 35_000,
      adSpend: null,
      adSpendRate: null,
      monthly: {
        yearMonth: '2026-09',
        revenue: 35_000,
        soldQuantity: 4,
        cost: null,
        grossProfit: null,
        grossMarginRate: null,
        coverageStartDate: '2026-09-01',
        coverageEndDate: '2026-09-22',
      },
      metricsFreshness: {
        orders: { ready: false, coverageStartDate: null, coverageEndDate: null, capturedAt: null },
        traffic: {
          capturedAt: null,
          basis: {
            kind: 'period' as const,
            from: '2026-07-10',
            to: '2026-07-16',
            targetDays: 7,
            includedDates: [],
            invalidDates: [],
            sources: ['wing_traffic'],
          },
        },
        advertising: { ready: false, coverageStartDate: null, coverageEndDate: null, capturedAt: null },
      },
    }],
    total: 126,
    page: 2,
    limit: 50,
    summary: {
      abcGradeCounts: { A: 37, B: 29, C: 50, unclassified: 10 },
      contributionOverview: null,
      abcFormula: null,
      abcOfficialCutoffDate: '2026-07-31',
      displayDataAsOf: '2026-07-31',
      channelProductCounts: [{
        channelAccountId: '00000000-0000-4000-8000-000000000004',
        channel: 'coupang',
        channelAccountName: 'Coupang Wing',
        count: 120,
      }, {
        channelAccountId: '00000000-0000-4000-8000-000000000005',
        channel: 'coupang_rocket',
        channelAccountName: 'Coupang Rocket',
        count: 6,
      }],
      inventoryStatusCounts: {
        sellable: 81,
        out_of_stock: 9,
        configuration_required: 15,
        review_required: 14,
      },
      negativeProfitCount: 8,
      imminentProductCount: 5,
      reorderProductCount: 12,
      depletionCoveredProductCount: 54,
    },
  } as unknown as MasterProductOperationsListResponse,
  overviewData: undefined as MasterProductOperationsListResponse | undefined,
  overviewErrorMessage: null as string | null,
  errorMessage: null as string | null,
  goToPage: vi.fn(),
  handleSearch: vi.fn((event: { preventDefault: () => void }) => event.preventDefault()),
  inventoryStatus: 'all' as const,
  inventoryFocus: 'all' as const,
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
  setInventoryFocus: vi.fn(),
  setPeriodDays: vi.fn(),
  setSearch: vi.fn(),
  sort: 'latest' as const,
  setSort: vi.fn(),
  totalPages: 3,
}));
const defaultData = state.data;
state.overviewData = defaultData;

vi.mock('../hooks/useProductHubPageState', () => ({
  PAGE_SIZE: 50,
  useProductHubPageState: () => state,
}));

vi.mock('./ProductAbcDetailDialog', () => ({
  ProductAbcDetailDialog: ({ open, product }: { open: boolean; product: { name: string } | null }) => open ? <div role="dialog">{product?.name} ABC 평가 근거</div> : null,
}));

vi.mock('./ProductOperationsDataStatusAction', () => ({
  ProductOperationsDataStatusAction: () => <button type="button">ABC 등급 현황</button>,
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
    expect(screen.queryByRole('button', { name: '재고 동기화' })).not.toBeInTheDocument();
    expect(screen.getByText('매출 · 광고 · 재고 · 수익성 통합 관리')).toBeInTheDocument();
    expect(screen.getByText('판매중 재고상품')).toBeInTheDocument();
    expect(screen.getByText('판매중 채널 등록상품')).toBeInTheDocument();
    const channelCard = screen.getByText('판매중 채널 등록상품').closest('article');
    expect(channelCard).not.toBeNull();
    expect(within(channelCard!).getByText('Coupang Wing')).toBeInTheDocument();
    expect(within(channelCard!).getByText('Coupang Rocket')).toBeInTheDocument();
    expect(screen.queryByText('채널 연결')).not.toBeInTheDocument();
    expect(screen.queryByText('채널 미연결')).not.toBeInTheDocument();
    expect(screen.queryByText('알림')).not.toBeInTheDocument();
    expect(screen.queryByText('Sellpia 가져오기 내역')).not.toBeInTheDocument();
    const catalogCard = screen.getByText('판매중 재고상품').closest('article');
    expect(catalogCard).not.toBeNull();
    expect(within(catalogCard!).getByText('A등급')).toBeInTheDocument();
    expect(within(catalogCard!).getByText('B등급')).toBeInTheDocument();
    expect(within(catalogCard!).getByText('C등급')).toBeInTheDocument();
    expect(within(catalogCard!).getByText('미분류')).toBeInTheDocument();
    expect(within(catalogCard!).getByText('37')).toBeInTheDocument();
    expect(within(catalogCard!).getByText('10')).toBeInTheDocument();
    expect(within(channelCard!).getByText('120')).toBeInTheDocument();
    expect(within(channelCard!).getByText('6')).toBeInTheDocument();
    expect(within(catalogCard!).queryByText(/현재 페이지 A등급/)).not.toBeInTheDocument();
    expect(screen.getByText('재고관리')).toBeInTheDocument();
    expect(screen.getAllByText('임박 재고').length).toBeGreaterThan(0);
    expect(screen.getAllByText('발주 필요').length).toBeGreaterThan(0);
    expect(screen.getByText('손익점검')).toBeInTheDocument();
    expect(screen.getByText('점검 대상')).toBeInTheDocument();
    expect(screen.getByText('기간 매출')).toBeInTheDocument();
    expect(screen.getByText('순영업이익')).toBeInTheDocument();
    expect(screen.getByText('ABC 등급 현황')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '전체 카테고리' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '완구/놀이' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '상품' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '현재고' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '매출' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '매출총이익' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '광고비율' })).not.toBeInTheDocument();
    expect(screen.getByText('당월 실적 · KST 2026-09 · 측정 2026-09-01–2026-09-22')).toBeInTheDocument();
    expect(screen.getByText('현재고는 최신 저장값 · ABC 공식 기준일 2026-07-31')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '미분류' })).toHaveValue('unclassified');
    expect(screen.queryByRole('combobox', { name: 'ABC 상태' })).not.toBeInTheDocument();
    expect(screen.getByText('스테이지 상품')).toBeInTheDocument();
    expect(screen.getByText(/상품 코드 KI-001/)).toBeInTheDocument();
    expect(screen.getAllByText('재고 연결 필요').length).toBeGreaterThan(0);
    expect(screen.queryByText(/공유 SKU 기준/)).not.toBeInTheDocument();
    const inventoryCard = screen.getByText('재고관리').closest('article');
    expect(inventoryCard).not.toBeNull();
    expect(within(inventoryCard!).getByText('5')).toBeInTheDocument();
    expect(within(inventoryCard!).queryByText('기준 미정')).not.toBeInTheDocument();
    expect(inventoryCard).not.toHaveTextContent('17');
  });

  it('shows the canonical source product KID code', () => {
    state.data = {
      ...defaultData,
      items: [{
        ...defaultData.items[0],
        code: 'KID00000001',
        displayReference: {
          type: 'product_code',
          label: '상품 코드',
          value: 'KID00000001',
        },
      }],
    };

    render(<ProductsPageContent headingLevel={1} />);

    expect(screen.getByText(/상품 코드 KID00000001/)).toBeInTheDocument();
    expect(screen.queryByText(/CP-11111111/)).not.toBeInTheDocument();
  });

  it('keeps the staged header focused on period and data controls without manual product creation', () => {
    render(<ProductsPageContent headingLevel={1} />);

    expect(screen.getByRole('button', { name: 'ABC 등급 현황' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '트래픽 업로드' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '7일' }));
    expect(state.setPeriodDays).toHaveBeenCalledWith(7);
    expect(screen.queryByRole('button', { name: '+ 상품 추가' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '자동 ABC 정책' })).not.toBeInTheDocument();
  });

  it('offers server-backed sort controls without changing the monthly scope control', () => {
    render(<ProductsPageContent headingLevel={1} />);

    const sortGroup = screen.getByRole('group', { name: '정렬' });
    expect(within(sortGroup).getByRole('button', { name: '최신 등록순' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(sortGroup).getByRole('button', { name: '이익순' })).toBeDisabled();
    expect(within(sortGroup).getByRole('button', { name: '이익률순' })).toBeDisabled();
    expect(within(sortGroup).getByRole('button', { name: '이익순' })).toHaveAttribute('title', '당월 손익 근거 준비 중 · 월별 원가가 없어 계산 불가합니다.');
    fireEvent.click(within(sortGroup).getByRole('button', { name: '매출순' }));

    expect(state.setSort).toHaveBeenCalledWith('revenue');
    expect(screen.getByText('당월 실적 · KST 2026-09 · 측정 2026-09-01–2026-09-22')).toBeInTheDocument();
  });

  it('keeps all product columns reachable through horizontal scrolling on narrow screens', () => {
    render(<ProductsPageContent headingLevel={1} />);

    const viewport = screen.getByRole('region', { name: '상품 목록 표' });
    expect(viewport).toHaveAttribute('tabindex', '0');
    expect(viewport).toHaveClass('overflow-x-auto');
    expect(within(viewport).getByRole('row').parentElement).toHaveClass('min-w-[1164px]');
  });

  it('shows row-specific monthly coverage when the table does not share one period', () => {
    const first = defaultData.items[0]!;
    state.data = {
      ...defaultData,
      items: [first, {
        ...first,
        id: '22222222-2222-4222-8222-222222222222',
        name: '다른 기간 상품',
        monthly: {
          ...first.monthly!,
          yearMonth: '2026-08',
          coverageStartDate: '2026-08-01',
          coverageEndDate: '2026-08-31',
        },
      }],
    };

    render(<ProductsPageContent headingLevel={1} />);

    expect(screen.getByText('당월 실적 · KST 2026-09 · 측정 상품별 수집 범위 상이')).toBeInTheDocument();
    expect(screen.getByTitle('매출 · KST 2026-09 · 수집 범위 2026-09-01–2026-09-22')).toHaveTextContent('35,000원');
    expect(screen.getByTitle('매출 · KST 2026-08 · 수집 범위 2026-08-01–2026-08-31')).toBeInTheDocument();
  });

  it('marks a shared period as applying only to measured products when a row is unmeasured', () => {
    const first = defaultData.items[0]!;
    state.data = {
      ...defaultData,
      items: [first, {
        ...first,
        id: '33333333-3333-4333-8333-333333333333',
        name: '미측정 상품',
        monthly: null,
      }],
    };

    render(<ProductsPageContent headingLevel={1} />);

    expect(screen.getByText('당월 실적 · KST 2026-09 · 측정 수집상품만 2026-09-01–2026-09-22 · 미측정 상품 있음')).toBeInTheDocument();
    expect(screen.getByTitle('판매 · 월별 수집 미측정')).toHaveTextContent('—');
  });

  it('uses full-result operating summaries with one inventory command card', () => {
    render(<ProductsPageContent headingLevel={1} />);

    expect(screen.queryByText(/현재 페이지/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /발주하기/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '재고 설정 확인 상품 보기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '품절 상품 보기' })).toBeInTheDocument();
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

  it('shows ABC grade counts as unknown, not 0, before Products publishes ABC', () => {
    state.overviewData = {
      ...defaultData,
      summary: {
        ...defaultData.summary,
        abcGradeCounts: { A: 0, B: 0, C: 0, unclassified: 126 },
        abcOfficialCutoffDate: null,
      },
    };

    render(<ProductsPageContent headingLevel={1} />);

    for (const label of ['A등급', 'B등급', 'C등급']) {
      expect(screen.getByRole('button', { name: `${label} 상품 보기` })).toHaveTextContent(`${label}—`);
    }
    // Unclassified counts catalog products, not a publication, so it stays a number.
    expect(screen.getByRole('button', { name: '미분류 상품 보기' })).toHaveTextContent('미분류126');
  });

  it('filters the product list from each inventory command-center indicator', () => {
    render(<ProductsPageContent headingLevel={1} />);

    fireEvent.click(screen.getByRole('button', { name: '재고 설정 확인 상품 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '품절 상품 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '임박 재고 상품 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '발주 필요 상품 보기' }));

    expect(state.setInventoryFocus).toHaveBeenNthCalledWith(1, 'attention');
    expect(state.setInventoryFocus).toHaveBeenNthCalledWith(2, 'out_of_stock');
    expect(state.setInventoryFocus).toHaveBeenNthCalledWith(3, 'imminent');
    expect(state.setInventoryFocus).toHaveBeenNthCalledWith(4, 'reorder');
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
        channelProductCounts: [{
          channelAccountId: '00000000-0000-4000-8000-000000000004',
          channel: 'coupang',
          channelAccountName: 'Coupang Wing',
          count: 8,
        }, {
          channelAccountId: '00000000-0000-4000-8000-000000000005',
          channel: 'coupang_rocket',
          channelAccountName: 'Coupang Rocket',
          count: 1,
        }],
      },
    };
    state.overviewData = defaultData;

    render(<ProductsPageContent headingLevel={1} />);

    const catalogCard = screen.getByText('판매중 재고상품').closest('article');
    expect(catalogCard).not.toBeNull();
    expect(within(catalogCard!).getByText('126')).toBeInTheDocument();
    expect(within(catalogCard!).queryByText('Coupang Wing')).not.toBeInTheDocument();
    expect(within(catalogCard!).queryByText('채널 연결')).not.toBeInTheDocument();
    expect(within(catalogCard!).queryByText('채널 미연결')).not.toBeInTheDocument();
    const channelCard = screen.getByText('판매중 채널 등록상품').closest('article');
    expect(channelCard).not.toBeNull();
    expect(within(channelCard!).getByText('120')).toBeInTheDocument();
    expect(screen.getByText('9개 표시')).toBeInTheDocument();
  });

  it('shows a load error without also claiming a valid empty result', () => {
    state.data = { ...defaultData, items: [], total: 0 };
    state.errorMessage = '상품 목록 실패';

    render(<ProductsPageContent headingLevel={1} />);

    expect(screen.getByText('상품 목록 실패')).toBeInTheDocument();
    expect(screen.queryByText('조건에 맞는 KidItem 상품이 없습니다.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '상품 목록 다시 시도' }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });

  describe('partial Wing traffic period', () => {
    afterEach(() => {
      state.isPlaceholderData = false;
    });

    it('says once for the whole list that views and cart adds cover only part of the period', () => {
      state.data = listWithTrafficBasis(trafficBasis(13));

      render(<ProductsPageContent headingLevel={1} />);

      expect(screen.getAllByText('조회·장바구니 부분 13/14일')).toHaveLength(1);
    });

    it.each<[string, () => void]>([
      ['every day is covered', () => {
        state.data = listWithTrafficBasis(trafficBasis(14));
      }],
      ['no day is covered', () => {
        state.data = listWithTrafficBasis(trafficBasis(0));
      }],
      ['the list has no rows', () => {
        state.data = { ...defaultData, items: [], total: 0 };
      }],
      ['the list failed to load', () => {
        state.data = listWithTrafficBasis(trafficBasis(13));
        state.errorMessage = '상품 목록 실패';
      }],
      ['the list is refreshing for new conditions', () => {
        state.data = listWithTrafficBasis(trafficBasis(13));
        state.isPlaceholderData = true;
      }],
    ])('shows no period caption when %s', (_case, arrange) => {
      arrange();

      render(<ProductsPageContent headingLevel={1} />);

      expect(screen.queryByText(/조회·장바구니 부분/)).not.toBeInTheDocument();
    });
  });
});

/** A 14-day Wing traffic basis whose first `coveredDays` days were collected. */
function trafficBasis(coveredDays: number): DashboardPeriodBasis {
  return buildPeriodBasis({
    from: '2026-09-01',
    to: '2026-09-14',
    includedDates: enumerateDashboardDates('2026-09-01', '2026-09-14').slice(0, coveredDays),
    sources: ['wing_traffic'],
  });
}

/** Two rows read over one query window, so both carry the same traffic basis. */
function listWithTrafficBasis(basis: DashboardPeriodBasis): MasterProductOperationsListResponse {
  const row = defaultData.items[0]!;
  return {
    ...defaultData,
    items: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'].map((id, index) => ({
      ...row,
      id,
      name: `스테이지 상품 ${index + 1}`,
      metricsFreshness: {
        ...row.metricsFreshness,
        traffic: { capturedAt: '2026-09-15T00:00:00.000Z', basis },
      },
    })),
  };
}
