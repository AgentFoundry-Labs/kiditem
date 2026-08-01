import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ZodError } from 'zod';
import { ApiError } from '@/lib/api-error';

// Mock next/navigation BEFORE importing the page (page uses useRouter)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock dynamic charts (jsdom can't render Recharts)
vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

// Mock toast (no DOM noise)
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
  },
}));

vi.mock('@/hooks/useSellpiaChannelSales', () => ({
  sellpiaPeriodRange: () => ({ from: '2026-07-01', to: '2026-07-27' }),
  useSellpiaChannelSales: () => ({
    summary: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    sync: vi.fn(),
    syncing: false,
  }),
}));

// Mock apiClient — page uses .getParsed and .get.
const getParsedMock = vi.fn();
const getMock = vi.fn();
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      getParsed: (path: string, schema: unknown) => getParsedMock(path, schema),
      get: (path: string) => getMock(path),
      patch: vi.fn(),
    },
  };
});

import Dashboard from '../(analytics)/dashboard/page';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Dashboard />
    </QueryClientProvider>,
  );
}

const successSales = {
  today: { revenue: 0, orders: 0 },
  monthly: {
    revenue: 100000, profit: 30000, adRate: 0,
    prevRevenue: 0, prevProfit: 0, revenueChange: 0, profitChange: 0, prevAdRate: 0,
  },
  topProducts: [],
  monthlyTrend: [],
  profitDetail: { revenue: 100000, costOfGoods: 50000, commission: 10000, shippingCost: 10000, adCost: 0, otherCost: 0, netProfit: 30000, orderCount: 1 },
  planAchievement: null,
  trafficKpi: { visitors: 0, views: 0, orders: 1, salesQty: 0, revenue: 100000, cartAdds: 0, adSummary: null, source: 'wing', netProfit: 30000, profitRate: 30 },
  lastSyncAt: null,
};
const successAd = {
  monthly: { roas: 0, ctr: 0, adRevenue: 0, totalAdSpend: 0, prevRoas: 0, prevCtr: 0, prevAdRevenue: 0, prevTotalAdSpend: 0 },
  industryBenchmark: { avgAdRate: 10, avgProfitRate: 8, avgRoas: 350, avgCtr: 0.3 },
};
const successInv = {
  totalProducts: 5,
  channelLinkedProducts: 3,
  channelUnlinkedProducts: 2,
  gradeCount: { A: 2, B: 2, C: 1 },
  classifiedProductCount: 5,
  unclassifiedProductCount: 0,
  abcStatusCount: {
    READY: 5,
    INSUFFICIENT_EVIDENCE: 0,
    SOURCE_UNMAPPED: 0,
    CALIBRATION_PENDING: 0,
    RECALCULATING: 0,
    SELLPIA_SOURCE_STALE: 0,
    AD_SOURCE_STALE: 0,
    CALCULATION_ERROR: 0,
  },
  abcContributionProfit: {
    amountByGrade: { A: 30_000, B: 10_000, C: -1_000 },
    shareByGrade: { A: 0.77, B: 0.26, C: -0.03 },
  },
  abcFormula: null,
  mappingStatusCounts: { matched: 0, unmatched: 0, needsReview: 0 },
  alerts: [],
  warnings: {
    minusProducts: 0,
    lowProfitProducts: 0,
    highAdProducts: 0,
    outOfStockSkus: 7,
    mappingAttentionSkus: 11,
  },
};
const successTrend: unknown[] = [];
beforeEach(() => {
  getParsedMock.mockReset();
  getMock.mockReset();
  getParsedMock.mockResolvedValue(null);
  getMock.mockImplementation((path: string) => {
    if (path === '/api/agent-os/instances') return Promise.resolve([]);
    return Promise.resolve([]);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Dashboard page (RTL)', () => {
  it('T1: hides content while baseline queries pending (PageSkeleton in place)', () => {
    getParsedMock.mockImplementation(() => new Promise(() => {})); // never resolves
    const { container } = renderPage();
    // Skeleton renders before content; the header text only appears after baselines resolve.
    // PageSkeleton's exact DOM is opaque to this test — we assert content absence + non-empty render.
    expect(screen.queryByText('Kiditem Foundry')).toBeNull();
    expect(container.firstChild).toBeTruthy();
  });

  it('T2: renders KPI cards on success', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(successInv);
      if (path.startsWith('/api/dashboard/trend')) return Promise.resolve(successTrend);
      if (path === '/api/action-tasks') return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Kiditem Foundry')).toBeTruthy();
      expect(screen.getByText(/카탈로그 전체 5/)).toBeTruthy();
      expect(screen.getByText(/채널 연결 3/)).toBeTruthy();
    });
  });

  it('shows factual Sellpia zero-stock and channel mapping-attention counts', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(successInv);
      if (path.startsWith('/api/dashboard/trend')) return Promise.resolve(successTrend);
      if (path === '/api/action-tasks') return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderPage();

    expect(await screen.findByText('셀피아 재고 0')).toBeInTheDocument();
    expect(screen.getByText('매칭 확인 필요')).toBeInTheDocument();
    expect(screen.getByText('7', { selector: '[data-warning-count="out-of-stock"]' })).toBeInTheDocument();
    expect(screen.getByText('11', { selector: '[data-warning-count="mapping-attention"]' })).toBeInTheDocument();
  });

  it('T3: 502 on non-baseline (trend) → SectionError shows server detail', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(successInv);
      if (path.startsWith('/api/dashboard/trend')) {
        return Promise.reject(new ApiError(502, 'BAD_GATEWAY', '502 Bad Gateway'));
      }
      if (path === '/api/action-tasks') return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('502 Bad Gateway')).toBeTruthy();
    });
  });

  it('T4: 502 on baseline (sales) → full-page error block, NOT SectionError', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') {
        return Promise.reject(new ApiError(502, 'BAD_GATEWAY', '502 Bad Gateway'));
      }
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(successInv);
      if (path.startsWith('/api/dashboard/trend')) return Promise.resolve(successTrend);
      if (path === '/api/action-tasks') return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('대시보드 데이터를 불러오는데 실패했습니다.')).toBeTruthy();
    });
    expect(screen.queryByText('502 Bad Gateway')).toBeNull();
  });

  it('T5: Zod drift on non-baseline (trend) → SectionError shows "응답 형식 오류"', async () => {
    // Note: Inventory is a baseline (`if (!inventoryData) → full-page error` fires first).
    // Zod drift on non-baseline endpoints (trend) flows through SectionError.
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(successInv);
      if (path.startsWith('/api/dashboard/trend')) {
        return Promise.reject(new ZodError([{ code: 'invalid_type', expected: 'number', received: 'string', path: [0, 'revenue'], message: 'Expected number' } as never]));
      }
      if (path === '/api/action-tasks') return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('응답 형식 오류 — 개발팀에 문의하세요')).toBeTruthy();
    });
  });

  it('T7: does not fetch the retired dashboard ActionTask board', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(successInv);
      if (path.startsWith('/api/dashboard/trend')) return Promise.resolve(successTrend);
      return Promise.resolve(null);
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Kiditem Foundry')).toBeTruthy();
    });
    const parsedPaths = getParsedMock.mock.calls.map((c) => c[0]);
    expect(parsedPaths).not.toContain('/api/action-tasks');
    expect(getMock).not.toHaveBeenCalledWith('/api/action-tasks');
  });

  it('T8: renders the current department quick-action board', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(successInv);
      if (path.startsWith('/api/dashboard/trend')) return Promise.resolve(successTrend);
      return Promise.resolve(null);
    });

    renderPage();
    expect(await screen.findByText('시장분석')).toBeInTheDocument();
    expect(screen.getByText('몰 주문수집 (전체수집)')).toBeInTheDocument();
    expect(screen.getByText('금일 쿠팡 쉽먼트 다운')).toBeInTheDocument();
  });

  it('T6: pipeline-stats endpoint is NOT called', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(successInv);
      if (path.startsWith('/api/dashboard/trend')) return Promise.resolve(successTrend);
      if (path === '/api/action-tasks') return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Kiditem Foundry')).toBeTruthy();
    });
    const allPaths = [...getParsedMock.mock.calls.map((c) => c[0]), ...getMock.mock.calls.map((c) => c[0])];
    expect(allPaths.some((p: string) => p.includes('pipeline-stats'))).toBe(false);
  });
});
