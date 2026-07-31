import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './page';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useSellpiaChannelSales', () => ({
  sellpiaPeriodRange: () => ({ from: '2026-07-01', to: '2026-07-24' }),
  useSellpiaChannelSales: () => ({
    summary: undefined,
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
      get: vi.fn().mockResolvedValue([]),
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
  planAchievement: null,
  trafficKpi: {
    visitors: 0,
    views: 0,
    orders: 0,
    salesQty: 0,
    revenue: 0,
    cartAdds: 0,
    adSummary: null,
    source: 'orders',
    netProfit: 0,
    profitRate: 0,
  },
  lastSyncAt: null,
};

beforeEach(() => {
  getParsedMock.mockReset();
  getParsedMock.mockImplementation((path: string) => {
    if (path === '/api/dashboard/sales') return Promise.resolve(sales);
    if (path === '/api/dashboard/ad') {
      return Promise.resolve({
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
        industryBenchmark: { avgAdRate: 10, avgProfitRate: 8, avgRoas: 350, avgCtr: 0.3 },
      });
    }
    if (path === '/api/dashboard/inventory') {
      return Promise.resolve({
        totalProducts: 10,
        channelLinkedProducts: 1,
        channelUnlinkedProducts: 9,
        classifiedProductCount: 4,
        unclassifiedProductCount: 6,
        gradeCount: { A: 2, B: 1, C: 1 },
        abcLifecycleCount: { NEW: 2, PROVISIONAL: 1, ESTABLISHED: 4 },
        abcRiskCount: { loss: 3, zeroValue: 2, dataQuality: 4 },
        abcContext: {
          metric: 'GROSS_PROFIT',
          periodDays: 360,
          lastCalculatedAt: '2026-07-31T00:00:00.000Z',
          sourceCapturedAt: '2026-07-30T00:00:00.000Z',
        },
        mappingStatusCounts: { matched: 0, unmatched: 0, needsReview: 0 },
        alerts: [],
        warnings: {
          minusProducts: 0,
          lowProfitProducts: 0,
          highAdProducts: 0,
          outOfStockSkus: 0,
          mappingAttentionSkus: 0,
          lowCtrProducts: 0,
          lowReviewProducts: 0,
        },
      });
    }
    if (path.startsWith('/api/dashboard/trend')) return Promise.resolve([]);
    if (path === '/api/action-tasks') return Promise.resolve([]);
    return Promise.resolve(null);
  });
});

describe('Dashboard automatic ABC grade cards', () => {
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

    expect(screen.getByText('정식 평가 중 50%')).toBeInTheDocument();
    expect(screen.getByText('미분류 6개')).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: /신상품/ })).toHaveAttribute(
      'href',
      '/product-hub?abcStage=NEW',
    );
    expect(screen.getByRole('link', { name: /예비 등급/ })).toHaveAttribute(
      'href',
      '/product-hub?abcStage=PROVISIONAL',
    );
    expect(screen.getByRole('link', { name: /손실 3개/ })).toHaveAttribute(
      'href',
      '/product-hub?abcRisk=LOSS',
    );
    expect(screen.getByText(/매출총이익 · 최근 12개월/)).toBeInTheDocument();
  });
});
