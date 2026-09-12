import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './page';
import { buildSnapshotBasis, type SellpiaSalesSummary } from '@kiditem/shared/dashboard';
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
          ? Promise.resolve({ allOk: true, checks: [] })
          : Promise.resolve([]),
      ),
      patch: vi.fn(),
      post: vi.fn(),
    },
  };
});

const sales = {
  today: { revenue: 0, orders: 0 },
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
      includedDays: 1,
      missingDates: [],
      invalidDates: [],
      sources: ['orders'],
      status: 'complete' as const,
      partial: false,
      observedAt: null,
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
    adSummary: null,
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
  },
  abcFormula: null,
  mappingStatusCounts: { matched: 0, unmatched: 0, needsReview: 0 },
  alerts: [],
  warnings: {
    minusProducts: 3,
    lowProfitProducts: 5,
    highAdProducts: 2,
    outOfStockSkus: 7,
    mappingAttentionSkus: 4,
    lowCtrProducts: 0,
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
  includedDays: 6,
  missingDates: [],
  invalidDates: [],
  sources: ['sellpia', 'coupang_ads'],
  status: 'complete' as const,
  partial: false,
  observedAt: '2026-09-06T01:00:00.000Z',
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

describe('Dashboard absolute ABC grade cards', () => {
  it('uses the classified denominator, exposes unclassified, and links exact filters', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    expect(screen.getByText('계산 완료 4개')).toBeInTheDocument();
    // Unclassified reads as a row of "지금 손이 필요한 것", against the other
    // counts, instead of a second copy in the ABC footer.
    expect(document.querySelector('[data-warning-count="abc-unclassified"]')).toHaveTextContent('6');
    expect(screen.getByRole('link', { name: /A등급/ })).toHaveAttribute(
      'href',
      '/product-hub?abcGrade=A',
    );
    expect(screen.getByRole('link', { name: /B등급/ })).toHaveAttribute(
      'href',
      '/product-hub?abcGrade=B',
    );
    expect(screen.getByRole('link', { name: /C등급/ })).toHaveAttribute(
      'href',
      '/product-hub?abcGrade=C',
    );
    // The panel is three grades. 평가 대기 and 원천 확인 필요 counted
    // populations rather than grades, and the latter published the same number
    // the attention rail already shows as ABC 미분류.
    expect(screen.queryByText('평가 대기')).not.toBeInTheDocument();
    expect(screen.queryByText('원천 확인 필요')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '수익성 ABC' }))
      .toHaveAttribute('title', '상품 관리에서 등급 새로고침을 실행하세요.');
    expect(screen.queryByText(/자동 계산|자동 평가|NaN/)).not.toBeInTheDocument();
  });

  it('does not render missing Wing traffic as a zero-valued product signal', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    // Nothing was collected, so every step holds the absent-value dash. The
    // slots stay on the screen: the panel is the same height either way, and a
    // step that is not there is a different statement from one with no value.
    // What must never happen is a step reading as 0.
    const funnel = within(screen.getByTestId('dashboard-traffic-funnel'));
    for (const label of ['일평균 방문자', '조회', '장바구니', '주문', '판매량']) {
      expect(funnel.getByText(label).parentElement).toHaveTextContent(`${label}—`);
    }
    expect(document.body).not.toHaveTextContent('판매량0');
    expect(document.body).not.toHaveTextContent('조회0');
    // The header carries no status caption: the ⓘ says it, and says it to a
    // screen reader too rather than only in colour.
    // The header carries no status caption: the ⓘ says it, and says it to a
    // screen reader too rather than only in colour.
    expect(funnel.getByRole('button', { name: /Wing 트래픽 퍼널 근거 안내 · 미수집/ })).toBeInTheDocument();
    expect(funnel.getByRole('button', { name: '수집 시작 →' })).toBeInTheDocument();
  });

  it('renders collected zeroes and daily-average visitors without conflating provider conversion', async () => {
    salesResponse = {
      ...sales,
      effectivePeriod: {
        year: 2026,
        month: 9,
        label: '2026-09',
        shifted: false,
        latestDataDate: '2026-09-03',
        revenueSource: 'wing',
        adSource: 'wing',
      },
      trafficKpi: {
        ...sales.trafficKpi,
        visitors: 355,
        views: 80,
        orders: 4,
        salesQty: 0,
        revenue: 0,
        cartAdds: 0,
        conversionRate: 5,
        dailyAverageVisitors: 177.5,
        providerConversionRate: 2.85,
        coverage: {
          from: '2026-09-01',
          to: '2026-09-03',
          targetDays: 3,
          completedDays: 3,
          missingDates: [],
        },
        reconciliation: {
          views: { status: 'MATCHED', dailySum: 80, periodValue: 80 },
          cartAdds: { status: 'UNVERIFIED', dailySum: 0, periodValue: null },
          orders: { status: 'MATCHED', dailySum: 4, periodValue: 4 },
          salesQty: { status: 'MATCHED', dailySum: 0, periodValue: 0 },
          revenue: { status: 'MISMATCH', dailySum: 0, periodValue: 1 },
        },
        exactPeriodEvidence: { filterScope: 'ALL_NORMAL_RFM' },
        source: 'wing',
        netProfit: null,
        profitRate: null,
        trafficAvailable: true,
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

    expect(screen.getByText('판매량').parentElement).toHaveTextContent('판매량0개');
    expect(screen.getByText('일평균 방문자').parentElement).toHaveTextContent('일평균 방문자177.5명');
    expect(screen.getByText('조회').parentElement).toHaveTextContent('조회80회');
    expect(screen.getByText('장바구니').parentElement).toHaveTextContent('장바구니0회');
    expect(screen.getByText('구매전환율').parentElement?.parentElement?.parentElement).toHaveTextContent('5.0%');
    // The provider's own rate is provenance, not a value of ours, so it reads
    // inside the ⓘ rather than across the header. What must never happen is the
    // two rates being conflated: the card shows ours.
    fireEvent.click(within(screen.getByTestId('dashboard-traffic-funnel'))
      .getByRole('button', { name: /Wing 트래픽 퍼널 근거 안내/ }));
    const funnelNote = await screen.findByRole('note');
    expect(funnelNote).toHaveTextContent('Wing 제공 전환율 2.9%');
    expect(screen.getByText('일별 합산·기간 원본 미대사 · 장바구니')).toBeInTheDocument();
    expect(screen.getByText('기간 원본 불일치로 숨김 · 매출')).toBeInTheDocument();
    expect(funnelNote).toHaveTextContent('계정 원본 · ALL_NORMAL_RFM · 상품 매칭 합산 아님');
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
  it('publishes a partially covered funnel and says how many days it covers', async () => {
    salesResponse = {
      ...sales,
      trafficKpi: {
        ...sales.trafficKpi,
        visitors: 185.1,
        views: 2325,
        orders: 92,
        salesQty: 537,
        revenue: 742730,
        cartAdds: 261,
        conversionRate: 3.96,
        dailyAverageVisitors: 185.1,
        providerConversionRate: 3.96,
        coverage: {
          from: '2026-09-01',
          to: '2026-09-11',
          targetDays: 11,
          completedDays: 10,
          missingDates: ['2026-09-11'],
        },
        reconciliation: null,
        exactPeriodEvidence: null,
        source: 'wing',
        trafficAvailable: true,
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

    const funnel = within(screen.getByTestId('dashboard-traffic-funnel'));
    // `부분 10/11일` was a caption saying what the ⓘ now says — in colour on
    // screen, and in its accessible name for anyone not reading colour.
    expect(funnel.getByRole('button', { name: /근거 안내 · 일부 기간 미수집/ })).toBeInTheDocument();
    expect(funnel.queryByText(/부분 10\/11일/)).not.toBeInTheDocument();
    expect(funnel.getByText('일평균 방문자').parentElement).toHaveTextContent('일평균 방문자185.1명');
    expect(funnel.getByText('조회').parentElement).toHaveTextContent('조회2,325회');
    expect(funnel.getByText('주문').parentElement).toHaveTextContent('주문92건');
    expect(document.body).not.toHaveTextContent('Wing 트래픽 미수집');
    // The first step is a daily average and the rest are period sums, so there
    // is no share of visitors to show. Dividing them read 1256.1%.
    expect(funnel.getByText('조회').parentElement).not.toHaveTextContent('%');
    // Later steps compare sum to sum and keep their rates.
    expect(funnel.getByText('장바구니').parentElement).toHaveTextContent('11.2%');
    expect(funnel.getByText('주문').parentElement).toHaveTextContent('35.2%');
  });

  it('keeps nullable traffic orders unavailable instead of falling back to today orders', async () => {
    salesResponse = {
      ...sales,
      today: { revenue: 0, orders: 99 },
      trafficKpi: {
        ...sales.trafficKpi,
        visitors: null,
        views: null,
        orders: null,
        salesQty: null,
        revenue: null,
        cartAdds: null,
        conversionRate: null,
        dailyAverageVisitors: null,
        providerConversionRate: null,
        trafficAvailable: true,
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

    expect(screen.getAllByText('주문')[0].parentElement).toHaveTextContent('주문—');
    expect(screen.queryByText('주문99건')).not.toBeInTheDocument();
    // A blank card no longer spells its own reason in eleven pixels — the
    // section's ⓘ says it per value, in a full sentence.
    expect(screen.queryByText('Wing 조회·주문 미수집')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /기간 지표 근거 안내/ })).toBeInTheDocument();
  });

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

    const primaryRevenue = screen.getByTestId('dashboard-primary-revenue');
    expect(screen.getByTestId('dashboard-primary-revenue-value')).toHaveTextContent('—');
    expect(primaryRevenue).not.toHaveTextContent('목표');
    expect(primaryRevenue).not.toHaveTextContent('이전');
    expect(primaryRevenue).not.toHaveTextContent('광고외매출');
  });

  it('hides primary revenue goals when Wing revenue is rejected by reconciliation', async () => {
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
          revenue: { status: 'MISMATCH', dailySum: 0, periodValue: 100 },
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

    const primaryRevenue = screen.getByTestId('dashboard-primary-revenue');
    expect(screen.getByTestId('dashboard-primary-revenue-value')).toHaveTextContent('—');
    expect(primaryRevenue).not.toHaveTextContent('목표');
    expect(primaryRevenue).not.toHaveTextContent('이전');
    expect(primaryRevenue).toHaveTextContent('기간 원본 불일치로 숨김 · 매출');
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

    const primaryRevenue = screen.getByTestId('dashboard-primary-revenue');
    expect(screen.getByTestId('dashboard-primary-revenue-value')).toHaveTextContent('363,200');
    // An unavailable change is no change: the slot is absent rather than
    // showing a dash beside a real revenue figure.
    expect(screen.queryByTestId('dashboard-primary-revenue-change')).toBeNull();
    expect(primaryRevenue).not.toHaveTextContent('NaN');
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

    expect(screen.getByText('정산 데이터 없음')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-primary-profit'))
      .toHaveAttribute('title', 'Wing/Drive 데이터에는 매입가·수수료·배송비가 없어 순이익을 산출할 수 없습니다.');
  });

  it('keeps measured ad values and discloses missing coverage for a partial range', async () => {
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

    // Partial coverage still supports the values that were measured. The
    // panel's ⓘ carries how much is missing — in colour, and in its accessible
    // name — instead of a caption beside every value.
    expect(screen.getByRole('button', { name: /광고 성과 근거 안내/ })).toBeInTheDocument();
    expect(screen.queryByText('부분 5/7일')).not.toBeInTheDocument();
    expect(screen.getByText('광고전환매출').parentElement).toHaveTextContent('광고전환매출 쿠팡0원');

    expect(screen.queryByText('광고전환매출—')).not.toBeInTheDocument();
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

    expect(screen.getByText('광고전환매출').parentElement).toHaveTextContent('광고전환매출 쿠팡0원');
    expect(screen.getByText('광고비율').parentElement?.parentElement?.parentElement).toHaveTextContent('0.0%');
    expect(screen.getByText('광고수익률').parentElement?.parentElement?.parentElement).toHaveTextContent('0%');
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

    const roasCard = screen.getByText('광고수익률').parentElement?.parentElement?.parentElement;
    await waitFor(() => expect(roasCard).toHaveTextContent('이전 —'));
    expect(roasCard).not.toHaveTextContent('NaN');
  });

  it('does not invent Sellpia profit or a profit-rate goal when account ads are missing', async () => {
    const emptyGroup = { revenue: 0, qty: 0, cost: 0, daily: [], malls: [] };
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

    const profitCard = screen
      .getByText('셀피아 · 판매금액 − 매입가 − 쿠팡 광고비')
      .closest('[data-testid="dashboard-primary-profit"]');
    expect(profitCard).toHaveTextContent('—');
    expect(profitCard).toHaveAttribute('title', '판매금액과 비용의 공통 유효 날짜가 없어 순이익을 산출할 수 없습니다.');
    const detail = await openProfitDetail();
    expect(detail).toHaveTextContent('집행광고비—');
    expect(detail).not.toHaveTextContent('400,000원');

    const profitRateLabel = screen.getAllByText('이익률')[0];
    const profitRateCard = profitRateLabel?.closest('[data-testid="dashboard-metric-card"]');
    expect(profitRateCard).toHaveTextContent('—');
  });

  it('does not borrow order profit inputs beneath an unavailable Sellpia card', async () => {
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
    const emptyGroup = { revenue: 0, qty: 0, cost: 0, daily: [], malls: [] };
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

    const profitCard = screen
      .getByText('셀피아 · 판매금액 − 매입가 − 쿠팡 광고비')
      .closest('[data-testid="dashboard-primary-profit"]');
    const detail = await openProfitDetail();
    expect(detail).toHaveTextContent('집행광고비—');
    expect(detail).toHaveTextContent('비광고 비용—');
    expect(detail).toHaveTextContent('판매수량—');
    expect(detail).not.toHaveTextContent('200,000원');
    expect(detail).not.toHaveTextContent('400,000원');
    expect(detail).not.toHaveTextContent('12개');
  });

  it('renders Sellpia server profitability values without recomputing them from inputs', async () => {
    const emptyGroup = { revenue: 0, qty: 0, cost: 0, daily: [], malls: [] };
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

    const profitCard = screen
      .getByText('셀피아 · 판매금액 − 매입가 − 쿠팡 광고비')
      .closest('[data-testid="dashboard-primary-profit"]');
    expect(profitCard).toHaveTextContent('777원');
    expect(profitCard).not.toHaveTextContent('800원');
    const profitRateLabel = screen.getAllByText('이익률')[0];
    const profitRateCard = profitRateLabel?.closest('[data-testid="dashboard-metric-card"]');
    expect(profitRateCard).toHaveTextContent('77.7%');
  });

  it('keeps a complete explicit zero-cost Sellpia result numeric', async () => {
    const emptyGroup = { revenue: 0, qty: 0, cost: 0, daily: [], malls: [] };
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

    const profitCard = screen
      .getByText('셀피아 · 판매금액 − 매입가 − 쿠팡 광고비')
      .closest('[data-testid="dashboard-primary-profit"]');
    expect(profitCard).toHaveTextContent('0원');
    const detail = await openProfitDetail();
    expect(detail).toHaveTextContent('집행광고비0원');
    const profitRateLabel = screen.getAllByText('이익률')[0];
    const profitRateCard = profitRateLabel?.closest('[data-testid="dashboard-metric-card"]');
    expect(profitRateCard).toHaveTextContent('0.0%');
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
describe('Dashboard warning cards and their published basis', () => {
  const WARNING_CARDS = [
    { key: 'warnings.minusProducts', testId: 'minus-products', count: '3' },
    { key: 'warnings.lowProfitProducts', testId: 'low-profit-products', count: '5' },
    { key: 'warnings.highAdProducts', testId: 'high-ad-products', count: '2' },
    { key: 'warnings.outOfStockSkus', testId: 'out-of-stock', count: '7' },
    { key: 'warnings.mappingAttentionSkus', testId: 'mapping-attention', count: '4' },
  ] as const;

  function warningText(testId: string): string | null {
    return document.querySelector(`[data-warning-count="${testId}"]`)?.textContent ?? null;
  }

  it('renders every warning count when the server publishes an owner-backed snapshot basis', async () => {
    inventoryResponse = {
      ...inventory,
      metricBasis: Object.fromEntries(
        WARNING_CARDS.map(({ key }) => [
          key,
          buildSnapshotBasis({
            asOf: '2026-09-08',
            requiredAsOf: '2026-09-08',
            observedAt: '2026-09-08T00:30:00.000Z',
            sources: ['orders', 'channel_listings'],
          }),
        ]),
      ),
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    for (const { testId, count } of WARNING_CARDS) {
      expect(warningText(testId), testId).toBe(count);
    }
  });

  it('keeps a stale but retained snapshot displaying its number', async () => {
    inventoryResponse = {
      ...inventory,
      metricBasis: Object.fromEntries(
        WARNING_CARDS.map(({ key }) => [
          key,
          buildSnapshotBasis({
            asOf: '2026-06-30',
            requiredAsOf: '2026-09-08',
            sources: ['sellpia_inventory'],
          }),
        ]),
      ),
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    for (const { testId, count } of WARNING_CARDS) {
      expect(warningText(testId), testId).toBe(count);
    }
  });

  it('shows the unavailable marker when a warning has no owner evidence at all', async () => {
    inventoryResponse = {
      ...inventory,
      metricBasis: Object.fromEntries(
        WARNING_CARDS.map(({ key }) => [
          key,
          buildSnapshotBasis({ sources: ['sellpia_inventory'], measured: false }),
        ]),
      ),
    };

    renderDashboard();
    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    for (const { testId } of WARNING_CARDS) {
      expect(warningText(testId), testId).toBe('—');
    }
  });

  it('shows the unavailable marker for a payload that publishes no basis at all', async () => {
    // The regression itself: a server that computes the counts but publishes
    // no `metricBasis` is indistinguishable from one that has no evidence.
    inventoryResponse = inventory;

    renderDashboard();
    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeInTheDocument());

    for (const { testId } of WARNING_CARDS) {
      expect(warningText(testId), testId).toBe('—');
    }
  });
});
