import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSnapshotBasis, type SellpiaSalesSummary } from '@kiditem/shared/dashboard';
import Dashboard from './page';
const sellpiaState = vi.hoisted(() => ({
  summary: undefined as SellpiaSalesSummary | undefined,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'ready',
    user: { organizationId: '22222222-2222-4222-8222-222222222222' },
  }),
}));
vi.mock('@/hooks/useSellpiaChannelSales', () => ({
  sellpiaPeriodRange: () => ({ from: '2026-07-01', to: '2026-07-24' }),
  useSellpiaKnownThrough: () => '2026-07-24',
  useSellpiaChannelSales: () => ({
    summary: sellpiaState.summary,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    sync: vi.fn(),
    syncing: false,
  }),
}));

const getParsedMock = vi.fn();
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      getParsed: (path: string) => getParsedMock(path),
      get: vi.fn((path: string) =>
        path === '/api/readiness'
          ? Promise.resolve({ checks: [] })
          : Promise.resolve([]),
      ),
      patch: vi.fn(),
      post: vi.fn(),
    },
  };
});

const sales = {
  today: { revenue: 0, orders: 0, collectedOrders: 0, missingDateCount: 0 },
  monthly: {
    revenue: 0,
    profit: 0,
    adRate: 0,
    prevRevenue: 0,
    prevProfit: 0,
    revenueChange: 0,
    profitChange: 0,
    prevAdRate: 0,
  },
  topProducts: [],
  monthlyTrend: [],
  profitDetail: {
    revenue: 0,
    costOfGoods: 0,
    commission: 0,
    shippingCost: 0,
    adCost: 0,
    otherCost: 0,
    netProfit: 0,
    orderCount: 0,
  },
  profitInputs: {
    revenue: 0,
    cost: 0,
    adCost: 0,
    qty: 0,
    basis: {
      kind: 'period' as const,
      from: '2026-09-01',
      to: '2026-09-01',
      targetDays: 1,
      includedDates: ['2026-09-01'],
      invalidDates: [],
      sources: ['orders'],
    },
  },
  planAchievement: null,
  trafficKpi: {
    visitors: null,
    views: null,
    orders: null,
    salesQty: null,
    revenue: null,
    cartAdds: null,
    conversionRate: null,
    dailyAverageVisitors: null,
    providerConversionRate: null,
    coverage: null,
    reconciliation: null,
    exactPeriodEvidence: null,
    source: 'orders',
    netProfit: null,
    profitRate: null,
    trafficAvailable: false,
    trafficObservedAt: null,
  },
  lastSyncAt: null,
};

const ad = {
  monthly: {
    roas: 0,
    ctr: 0,
    adRevenue: 0,
    totalAdSpend: 0,
    prevRoas: 0,
    prevCtr: 0,
    prevAdRevenue: 0,
    prevTotalAdSpend: 0,
  },
  industryBenchmark: { myAdRate: 10, myRoas: 350, myCtr: 0.3 },
};

const inventory = {
  totalProducts: 10,
  channelLinkedProducts: 1,
  channelUnlinkedProducts: 9,
  classifiedProductCount: 4,
  unclassifiedProductCount: 6,
  gradeCount: { A: 2, B: 1, C: 1 },
  abcStatusCount: {
    READY: 4,
    INSUFFICIENT_EVIDENCE: 2,
    SOURCE_UNMAPPED: 1,
    SELLPIA_SOURCE_STALE: 2,
    AD_SOURCE_STALE: 1,
  },
  abcContributionProfit: {
    amountByGrade: { A: 12_000, B: 4_000, C: -500 },
    shareByGrade: { A: 0.77, B: 0.26, C: -0.03 },
    basis: { publicationRevision: null, officialCutoffDate: null, publishedAt: null, sellpiaSourceImportRunId: null, advertisingSourceImportRunId: null, mappingGeneration: null, includedProductCount: 0, withheldProductCount: 0, denominator: 15_500 },
  },
  abcFormula: null,
  alerts: [],
  warnings: {
    minusProducts: 3,
    lowProfitProducts: 5,
    highAdProducts: 2,
    outOfStockSkus: 7,
    mappingAttentionSkus: 4,
    lowReviewProducts: 0,
  },
};

let salesResponse = sales;
let adResponse = ad;
let inventoryResponse: Record<string, unknown> = inventory;

const completeSellpiaProfitBasis = {
  kind: 'period' as const,
  from: '2026-09-01',
  to: '2026-09-06',
  targetDays: 6,
  includedDates: [
    '2026-09-01',
    '2026-09-02',
    '2026-09-03',
    '2026-09-04',
    '2026-09-05',
    '2026-09-06',
  ],
  invalidDates: [],
  sources: ['sellpia', 'coupang_ads'],
};

beforeEach(() => {
  salesResponse = sales;
  adResponse = ad;
  inventoryResponse = inventory;
  sellpiaState.summary = undefined;
  getParsedMock.mockReset();
  getParsedMock.mockImplementation((path: string) => {
    if (path === '/api/dashboard/sales') return Promise.resolve(salesResponse);
    if (path === '/api/dashboard/ad') {
      return Promise.resolve(adResponse);
    }
    if (path === '/api/dashboard/inventory') {
      return Promise.resolve(inventoryResponse);
    }
    if (path.startsWith('/api/dashboard/trend')) return Promise.resolve([]);
    if (path === '/api/sourcing/trend/status') {
      return Promise.resolve({
        naver: { latestAttempt: null, actualCutoffAt: null },
        shorts: { latestAttempt: null, actualCutoffAt: null },
      });
    }
    return Promise.resolve(null);
  });
});

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>,
  );
}


/**
 * The profit cell no longer prints its inputs — the detail modal does. Opening
 * it is how those values are reached now, so the assertions follow them there.
 */
async function openProfitDetail(): Promise<HTMLElement> {
  fireEvent.click(screen.getByTestId('dashboard-primary-profit'));
  return await screen.findByText('순이익 구조').then(h => h.closest('div[class*="max-w-md"]') as HTMLElement);
}

describe('Dashboard headline cards keep unknown values unknown', () => {


  /**
   * The stock card reads Products' own summary — the same read as the product
   * hub's first screen — and each count opens the hub filtered to it. Profit
   * contribution that was never computed is not "0 loss-making products".
   */
  it('renders stock cards from owner-published dashboard facts and preserves unknown profit', async () => {
    const baselineRead = getParsedMock.getMockImplementation()!;
    const measured = buildSnapshotBasis({ asOf: '2026-09-08', requiredAsOf: '2026-09-08', observedAt: '2026-09-08T00:00:00Z', sources: ['channel_listings'] });
    inventoryResponse = { ...inventory, warnings: { ...inventory.warnings, outOfStockSkus: 4, mappingAttentionSkus: 3 }, metricBasis: {
      'warnings.outOfStockSkus': measured, 'warnings.mappingAttentionSkus': measured,
    } };
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/findings') return Promise.resolve({
        productSalesCapturedAt: null, reorderSuggestions: [],
        salesDecline: { month: null, keyProductLimit: 30, count: null, items: [] },
        registrationFailures: { count: 0, byChannel: [] },
        reorderProductCount: 78, metricBasis: { reorderProductCount: measured },
      });
      if (path === '/api/dashboard/sales') return Promise.resolve(salesResponse);
      if (path === '/api/dashboard/ad') return Promise.resolve(adResponse);
      if (path === '/api/dashboard/inventory') return Promise.resolve(inventoryResponse);
      return baselineRead(path);
    });

    renderDashboard();

    const soon = await screen.findByTestId('headline-stockSoon');
    await waitFor(() => expect(soon).toHaveTextContent('78'));
    expect(soon.closest('a')).toHaveAttribute('href', '/product-hub?inventoryFocus=reorder');
    expect(screen.getByTestId('headline-stockOut')).toHaveTextContent('4');
    expect(screen.getByTestId('headline-stockMatching')).toHaveTextContent('3');
    const loss = screen.getByTestId('headline-lossProducts');
    expect(loss).toHaveTextContent('—');
    // 까닭은 줄 밑이 아니라 마우스를 얹으면 뜬다(받침 줄은 이름과 숫자뿐).
    expect(within(loss).getByTitle('기존 상품×쇼핑몰 손익 기준')).toBeInTheDocument();
  });

  it('renders an uncovered Today read as unavailable rather than zero', async () => {
    salesResponse = {
      ...sales,
      today: { revenue: null, orders: null, collectedOrders: null, missingDateCount: 0 },
      metricBasis: {
        'today.revenue': {
          kind: 'period',
          from: '2026-09-08',
          to: '2026-09-08',
          targetDays: 1,
          includedDates: [],
          invalidDates: [],
          sources: ['orders'],
        },
        'today.orders': {
          kind: 'period',
          from: '2026-09-08',
          to: '2026-09-08',
          targetDays: 1,
          includedDates: [],
          invalidDates: [],
          sources: ['orders'],
        },
      },
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    // 잰 적 없는 오늘은 '—' 이지 0 이 아니다. 오늘 수는 이제 쇼핑몰 칸이 말한다
    // (매출 칸은 영수증이 됐다, 사장님 2026-09-20).
    const today = screen.getByTestId('headline-mallOrders');
    expect(today).toHaveTextContent('—');
    expect(today).not.toHaveTextContent('0건');
  });

  it('keeps uncollected Inventory counts unavailable in the header', async () => {
    inventoryResponse = {
      ...inventory,
      channelLinkedProducts: null,
      channelUnlinkedProducts: null,
      warnings: { ...inventory.warnings, outOfStockSkus: null },
      metricBasis: {
        'warnings.outOfStockSkus': {
          kind: 'snapshot',
          measured: false,
          asOf: null,
          requiredAsOf: null,
          observedAt: null,
          sources: ['sellpia_inventory'],
          withheldCount: 0,
        },
      },
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    expect(screen.getByText('채널 연결 —')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('채널 연결 0');
  });


  /**
   * Coupang publishes Wing traffic a day behind its sales, so the last day of a
   * month-to-date window is routinely one it has not published. The read model
   * used to withhold every metric unless the whole window was covered, which
   * meant the funnel read as uncollected on almost every day of the month even
   * though ten days had been measured — the mirror of reading a missing day as
   * a zero. The days that were measured are published, and `부분 N/M일` — the
   * same phrase the ad lane uses — keeps them from reading as a window total.
   */

  /**
   * Wing publishes visitors per day, so the first step is an average over the
   * covered days and is rarely whole: QA saw 2,424 visitors over 13 days read
   * 186.462명. Visitors are counted whole, the way the sales-analysis card
   * shows the same average.
   */


  it('does not present a zero primary revenue KPI when the effective source is none', async () => {
    salesResponse = {
      ...sales,
      effectivePeriod: {
        year: 2026,
        month: 9,
        label: '2026-09',
        shifted: false,
        latestDataDate: null,
        revenueSource: 'none',
        adSource: 'none',
      },
      rangeKpi: {
        range: 'month',
        revenue: 0,
        profit: 0,
        prevRevenue: 0,
        prevProfit: 0,
        revenueChange: 0,
        profitChange: 0,
      },
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    const revenue = screen.getByTestId('headline-revenue');
    expect(revenue).toHaveTextContent('—');
    expect(revenue).not.toHaveTextContent('이전');
  });

  it('hides revenue when Wing revenue is rejected by reconciliation', async () => {
    salesResponse = {
      ...sales,
      effectivePeriod: {
        year: 2026,
        month: 9,
        label: '2026-09',
        shifted: false,
        latestDataDate: '2026-09-03',
        revenueSource: 'wing',
        adSource: 'none',
      },
      rangeKpi: {
        range: 'month',
        revenue: 0,
        profit: 0,
        prevRevenue: 0,
        prevProfit: 0,
        revenueChange: 0,
        profitChange: 0,
      },
      trafficKpi: {
        ...sales.trafficKpi,
        source: 'wing',
        revenue: 0,
        trafficAvailable: true,
        reconciliation: {
          revenue: { dailySum: 0, periodValue: 100 },
        },
      },
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    // 원본과 어긋나 버린 Wing 매출은 매출 칸에 서지 않는다.
    const revenue = screen.getByTestId('headline-revenue');
    expect(revenue).toHaveTextContent('—');
    expect(revenue).not.toHaveTextContent('이전');
  });

  it('keeps a valid current revenue while showing unavailable previous revenue and change', async () => {
    salesResponse = {
      ...sales,
      monthly: {
        ...sales.monthly,
        revenue: 363_200,
        profit: null,
        prevRevenue: null,
        prevProfit: null,
        revenueChange: null,
        profitChange: null,
        adRate: 0,
        prevAdRate: null,
      },
      effectivePeriod: {
        year: 2026,
        month: 9,
        label: '2026-09',
        shifted: false,
        latestDataDate: '2026-09-07',
        revenueSource: 'orders',
        adSource: 'none',
      },
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    const revenue = screen.getByTestId('headline-revenue');
    expect(revenue).toHaveTextContent('363,200');
    // 이전 매출을 모르면 변화도 없다 — 0% 나 NaN 으로 채우지 않는다.
    expect(revenue).not.toHaveTextContent('이전 대비');
    expect(revenue).not.toHaveTextContent('NaN');
  });

  it('does not turn unavailable Wing profit into zero', async () => {
    salesResponse = {
      ...sales,
      monthly: {
        ...sales.monthly,
        revenue: 363_200,
        profit: null,
        prevRevenue: 200_000,
        prevProfit: null,
        revenueChange: null,
        profitChange: null,
      },
      effectivePeriod: {
        year: 2026,
        month: 9,
        label: '2026-09',
        shifted: false,
        latestDataDate: '2026-09-07',
        revenueSource: 'wing',
        adSource: 'none',
      },
      trafficKpi: {
        ...sales.trafficKpi,
        source: 'wing',
        revenue: 363_200,
        trafficAvailable: true,
      },
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    const profit = screen.getByTestId('headline-profit');
    expect(profit).toHaveTextContent('—');
    expect(profit).not.toHaveTextContent('0원');
  });

  it('keeps measured ad values for a partial range', async () => {
    salesResponse = {
      ...sales,
      monthly: { ...sales.monthly, adRate: null, prevAdRate: null },
    };
    adResponse = {
      ...ad,
      monthly: {
        ...ad.monthly,
        coverage: {
          from: '2026-09-01',
          to: '2026-09-07',
          knownThrough: '2026-09-05',
          targetDays: 7,
          completedDays: 5,
          missingDates: ['2026-09-06', '2026-09-07'],
        },
      },
      adKpi: {
        totalSpend: 0,
        impressions: 0,
        clicks: 0,
        convRevenue: 0,
        ctr: 0,
        roas: 0,
        coverage: {
          from: '2026-09-01',
          to: '2026-09-07',
          knownThrough: '2026-09-05',
          targetDays: 7,
          completedDays: 5,
          missingDates: ['2026-09-06', '2026-09-07'],
        },
      },
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    // 부분 기간에 잰 값은 잰 값이다 — 빈칸으로 돌리지 않는다.
    const conv = screen.getByTestId('headline-adConvRevenue');
    expect(conv).toHaveTextContent('0원');
    expect(conv).not.toHaveTextContent('—');
  });

  it('keeps explicit ad zeroes when coverage is complete', async () => {
    adResponse = {
      ...ad,
      monthly: {
        ...ad.monthly,
        coverage: {
          from: '2026-09-01',
          to: '2026-09-07',
          knownThrough: '2026-09-07',
          targetDays: 7,
          completedDays: 7,
          missingDates: [],
        },
      },
      adKpi: {
        totalSpend: 0,
        impressions: 0,
        clicks: 0,
        convRevenue: 0,
        ctr: 0,
        roas: 0,
        coverage: {
          from: '2026-09-01',
          to: '2026-09-07',
          knownThrough: '2026-09-07',
          targetDays: 7,
          completedDays: 7,
          missingDates: [],
        },
      },
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    // 명시적인 0 은 0 이다. 세 칸 모두 지우지 않는다.
    expect(screen.getByTestId('headline-adConvRevenue')).toHaveTextContent('0원');
    expect(screen.getByTestId('headline-adSpend')).toHaveTextContent('0원');
    expect(screen.getByTestId('headline-roas')).toHaveTextContent('0%');
  });

  it('normalizes an older range ad payload without previous ROAS', async () => {
    adResponse = {
      ...ad,
      rangeKpi: {
        adSpend: 100,
        adConvRevenue: 400,
        adRoas: 400,
        // Older dashboard payloads omitted the optional previous ROAS field.
        adCost: 100,
        adRate: null,
      },
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    const roas = screen.getByTestId('headline-roas');
    // 이전 ROAS 가 없는 예전 응답이면 '이전' 줄을 비워 둔다 — 0% 로 채우지 않는다.
    await waitFor(() => expect(roas).not.toHaveTextContent('이전'));
    expect(roas).not.toHaveTextContent('NaN');
  });

  it('does not invent Sellpia profit when account ads are missing', async () => {
    const emptyGroup = { revenue: 0, qty: 0, cost: 0, revenueShare: null, daily: [], malls: [] };
    sellpiaState.summary = {
      range: { from: '2026-09-01', to: '2026-09-06' },
      rocket: emptyGroup,
      others: {
        ...emptyGroup,
        revenue: 1_000_000,
        qty: 25,
        cost: 600_000,
      },
      totalRevenue: 1_000_000,
      totalCost: 600_000,
      adCost: null,
      netProfit: null,
      profitRate: null,
      lastCapturedAt: '2026-09-06T01:00:00.000Z',
      hasData: true,
      profitInputs: null,
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    // 광고 계정 범위가 비면 셀피아 순이익을 지어내지 않는다.
    expect(screen.getByTestId('headline-profit')).toHaveTextContent('—');
  });

  it('does not borrow order profit beneath an unavailable Sellpia card', async () => {
    salesResponse = {
      ...sales,
      profitInputs: {
        ...sales.profitInputs,
        revenue: 900_000,
        cost: 400_000,
        adCost: 200_000,
        qty: 12,
      },
    };
    const emptyGroup = { revenue: 0, qty: 0, cost: 0, revenueShare: null, daily: [], malls: [] };
    sellpiaState.summary = {
      range: { from: '2026-09-01', to: '2026-09-06' },
      rocket: emptyGroup,
      others: { ...emptyGroup, revenue: 1_000_000, qty: 25, cost: 600_000 },
      totalRevenue: 1_000_000,
      totalCost: 600_000,
      adCost: null,
      netProfit: null,
      profitRate: null,
      lastCapturedAt: '2026-09-06T01:00:00.000Z',
      hasData: true,
      profitInputs: null,
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    // 셀피아 순이익이 비었다고 주문 기준 순이익을 빌려 오지 않는다.
    expect(screen.getByTestId('headline-profit')).toHaveTextContent('—');
  });

  it('renders Sellpia server profitability values without recomputing them from inputs', async () => {
    const emptyGroup = { revenue: 0, qty: 0, cost: 0, revenueShare: null, daily: [], malls: [] };
    sellpiaState.summary = {
      range: { from: '2026-09-01', to: '2026-09-06' },
      rocket: emptyGroup,
      others: { ...emptyGroup, revenue: 1_000, qty: 25, cost: 100 },
      totalRevenue: 1_000,
      totalCost: 100,
      adCost: 100,
      netProfit: 777,
      profitRate: 77.7,
      lastCapturedAt: '2026-09-06T01:00:00.000Z',
      hasData: true,
      profitInputs: {
        revenue: 1_000,
        cost: 100,
        adCost: 100,
        qty: 25,
        basis: completeSellpiaProfitBasis,
      },
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    // 서버가 낸 순이익을 그대로 쓴다 — 입력으로 다시 계산하지 않는다.
    const profit = screen.getByTestId('headline-profit');
    expect(profit).toHaveTextContent('777원');
    expect(profit).not.toHaveTextContent('800원');
  });

  it('keeps a complete explicit zero-cost Sellpia result numeric', async () => {
    const emptyGroup = { revenue: 0, qty: 0, cost: 0, revenueShare: null, daily: [], malls: [] };
    sellpiaState.summary = {
      range: { from: '2026-09-01', to: '2026-09-06' },
      rocket: emptyGroup,
      others: emptyGroup,
      totalRevenue: 0,
      totalCost: 0,
      adCost: 0,
      netProfit: 0,
      profitRate: 0,
      lastCapturedAt: '2026-09-06T01:00:00.000Z',
      hasData: true,
      profitInputs: {
        revenue: 0,
        cost: 0,
        adCost: 0,
        qty: 0,
        basis: completeSellpiaProfitBasis,
      },
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    expect(screen.getByTestId('headline-profit')).toHaveTextContent('0원');
  });
});

/**
 * AI가 발견한 문제 reads the Products summary for 재고 부족 — the same read as
 * the 재고 card, so the two can never disagree — and the findings read for the
 * rest. CS inquiries have no source, which is unknown and not zero.
 */
describe('Dashboard AI findings', () => {
  it('renders each area from its owner read and links the suggestion to its product', async () => {
    const baselineRead = getParsedMock.getMockImplementation()!;
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/findings') {
        return Promise.resolve({
          productSalesCapturedAt: '2026-09-17T17:10:53.758Z',
          reorderProductCount: 78,
          salesDecline: { month: '2026-08', keyProductLimit: 30, count: 23, items: [] },
          reorderSuggestions: [{
            productCode: '3189',
            name: '세계지도 만국기',
            optionName: null,
            masterProductId: '11111111-1111-4111-8111-111111111111',
            imageUrl: null,
            availableStock: 58,
            monthlyOutflow: 1_064,
            daysLeft: 3,
            reorderPoint: 1_596,
          }],
          registrationFailures: { count: 12, byChannel: [{ channel: 'coupang', mallName: '쿠팡(마켓플레이스)', count: 12 }] },
        });
      }
      if (path === '/api/dashboard/sales') return Promise.resolve(salesResponse);
      if (path === '/api/dashboard/ad') return Promise.resolve(adResponse);
      if (path === '/api/dashboard/inventory') return Promise.resolve(inventoryResponse);
      return baselineRead(path);
    });

    renderDashboard();

    // 발견한 수는 이제 칸이 아니라 '지금 해야 할 일' 줄로 나온다(사장님 2026-09-20).
    const queue = await screen.findByTestId('dashboard-work-queue');
    await waitFor(() => expect(queue).toHaveTextContent('주요 상품 23개가 덜 팔립니다'));
    expect(queue).toHaveTextContent('등록 실패 12건');
    expect(queue).toHaveTextContent('쿠팡(마켓플레이스) 12건');
    expect(screen.queryByTestId('dashboard-issue-stock')).toBeNull();
    expect(screen.getByTestId('dashboard-ai-suggestion-reorder:3189')).toHaveAttribute(
      'href',
      '/product-hub/11111111-1111-4111-8111-111111111111',
    );
  });
});

/**
 * Producer/consumer pairing for the warning cards.
 *
 * `formatWarningCount` renders a number only when the value's own basis says
 * it is measured. That gate shipped while `/api/dashboard/inventory` published
 * no `metricBasis` at all, so all five cards rendered the unavailable marker
 * over real server-computed counts. These cases pin both halves: the marker
 * when there is genuinely no basis, and the number when the server publishes
 * the owner-backed snapshot it now builds.
 *
 * The bases below are built with `buildSnapshotBasis` — the same constructor
 * `DashboardInventoryService` publishes through — with the same inputs a live
 * owner read gives it. The server side of the pair is asserted in
 * `apps/server/.../dashboard-metric-basis.spec.ts`
 * ("backs each of the five warning counts with a measured, non-unavailable basis").
 */
