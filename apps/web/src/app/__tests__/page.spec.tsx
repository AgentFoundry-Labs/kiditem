import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'ready',
    user: { organizationId: '22222222-2222-4222-8222-222222222222' },
  }),
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
  industryBenchmark: { myAdRate: 10, myRoas: 350, myCtr: 0.3 },
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
    ORDERS_SOURCE_STALE: 0,
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
  metricBasis: {
    'warnings.outOfStockSkus': {
      kind: 'snapshot',
      asOf: '2026-07-27',
      observedAt: null,
      sources: ['sellpia'],
      status: 'current',
      partial: false,
      withheldCount: 0,
    },
    'warnings.mappingAttentionSkus': {
      kind: 'snapshot',
      asOf: '2026-07-27',
      observedAt: null,
      sources: ['sellpia'],
      status: 'current',
      partial: false,
      withheldCount: 0,
    },
  },
};

/** Same counts, but with no published basis for any warning. */
const unverifiedWarningInv = { ...successInv, metricBasis: {} };
const successTrend: unknown[] = [];
beforeEach(() => {
  getParsedMock.mockReset();
  getMock.mockReset();
  getParsedMock.mockResolvedValue(null);
  getMock.mockImplementation((path: string) => {
    if (path === '/api/agent-os/instances') return Promise.resolve([]);
    if (path === '/api/readiness') return Promise.resolve({ allOk: true, checks: [] });
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
      return Promise.resolve(null);
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Kiditem Foundry')).toBeTruthy();
      expect(screen.getByText(/운영 상품 5/)).toBeTruthy();
      expect(screen.getByText(/판매중 채널 연결 재고상품 3/)).toBeTruthy();
    });
  });

  it('shows factual Sellpia zero-stock and channel mapping-attention counts', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(successInv);
      if (path.startsWith('/api/dashboard/trend')) return Promise.resolve(successTrend);
      return Promise.resolve(null);
    });

    renderPage();

    expect(await screen.findByText('셀피아 재고 0')).toBeInTheDocument();
    expect(screen.getByText('매칭 확인 필요')).toBeInTheDocument();
    expect(screen.getByText('7', { selector: '[data-warning-count="out-of-stock"]' })).toBeInTheDocument();
    expect(screen.getByText('11', { selector: '[data-warning-count="mapping-attention"]' })).toBeInTheDocument();
  });

  it('never renders a client-derived revenue goal when the server publishes none', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(successInv);
      if (path.startsWith('/api/dashboard/trend')) return Promise.resolve(successTrend);
      return Promise.resolve(null);
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Kiditem Foundry')).toBeTruthy());
    // 1.15 * previous, floored at 1,000,000 / 100,000, was the removed goal.
    expect(screen.getByTestId('dashboard-primary-revenue')).not.toHaveTextContent('목표');
    expect(screen.queryByText(/목표 1,000,000원/)).toBeNull();
    expect(screen.queryByText(/목표 100,000원/)).toBeNull();
  });

  it('renders warning counts as unavailable when the card has no basis', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(unverifiedWarningInv);
      if (path.startsWith('/api/dashboard/trend')) return Promise.resolve(successTrend);
      return Promise.resolve(null);
    });

    renderPage();

    expect(await screen.findByText('셀피아 재고 0')).toBeInTheDocument();
    for (const key of [
      'minus-products',
      'low-profit-products',
      'high-ad-products',
      'out-of-stock',
      'mapping-attention',
    ]) {
      expect(document.querySelector(`[data-warning-count="${key}"]`)).toHaveTextContent('—');
    }
    expect(screen.queryByText('7', { selector: '[data-warning-count="out-of-stock"]' })).toBeNull();
    expect(screen.queryByText('11', { selector: '[data-warning-count="mapping-attention"]' })).toBeNull();
  });

  it('T3: 502 on non-baseline (trend) → SectionError shows server detail', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(successInv);
      if (path.startsWith('/api/dashboard/trend')) {
        return Promise.reject(new ApiError(502, 'BAD_GATEWAY', '502 Bad Gateway'));
      }
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
      return Promise.resolve(null);
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('응답 형식 오류 — 개발팀에 문의하세요')).toBeTruthy();
    });
  });

  it('shows one retry for the whole page and never turns a failed read into no data', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') {
        return Promise.reject(new ApiError(502, 'BAD_GATEWAY', '재고 읽기 실패'));
      }
      if (path.startsWith('/api/dashboard/trend')) return Promise.resolve(successTrend);
      return Promise.resolve(null);
    });
    renderPage();

    const notice = await screen.findByTestId('dashboard-read-failure');
    expect(notice).toHaveTextContent('상품·재고');
    expect(notice).toHaveTextContent('재고 읽기 실패');
    // One failed read used to stack a retry button per section.
    expect(screen.getAllByRole('button', { name: '다시 시도' })).toHaveLength(1);

    // Every section that read inventory stays put, says 읽기 실패, and never
    // borrows the no-data wording.
    const unavailable = screen.getAllByTestId('dashboard-section-unavailable');
    expect(unavailable.map((section) => section.getAttribute('data-section')))
      .toEqual(['경고', '수익성 ABC', '알림']);
    unavailable.forEach((section) => {
      expect(section).toHaveTextContent('읽기 실패');
      expect(section).not.toHaveTextContent('데이터가 없습니다');
    });

    // The reads that succeeded keep rendering their own values.
    expect(screen.getByText('Kiditem Foundry')).toBeTruthy();
  });

  it('retries every failed read from the single page-level button', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') {
        return Promise.reject(new ApiError(502, 'BAD_GATEWAY', '재고 읽기 실패'));
      }
      if (path.startsWith('/api/dashboard/trend')) {
        return Promise.reject(new ApiError(502, 'BAD_GATEWAY', '추이 읽기 실패'));
      }
      return Promise.resolve(null);
    });
    renderPage();

    const notice = await screen.findByTestId('dashboard-read-failure');
    expect(notice).toHaveTextContent('상품·재고');
    expect(notice).toHaveTextContent('매출 추이');

    const callsFor = (match: string) =>
      getParsedMock.mock.calls.filter((call) => String(call[0]).startsWith(match)).length;
    const before = { inventory: callsFor('/api/dashboard/inventory'), trend: callsFor('/api/dashboard/trend') };

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => {
      expect(callsFor('/api/dashboard/inventory')).toBeGreaterThan(before.inventory);
      expect(callsFor('/api/dashboard/trend')).toBeGreaterThan(before.trend);
    });
  });

  it('reaches every basis through one affordance per section, not one per value', async () => {
    const salesWithBasis = {
      ...successSales,
      metricBasis: {
        'monthly.revenue': {
          kind: 'period',
          from: '2026-07-01',
          to: '2026-07-31',
          targetDays: 31,
          includedDates: ['2026-07-01'],
          includedDays: 1,
          missingDates: ['2026-07-02'],
          invalidDates: [],
          sources: ['orders'],
          status: 'partial',
          partial: true,
          observedAt: null,
        },
      },
    };
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(salesWithBasis);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(successInv);
      if (path.startsWith('/api/dashboard/trend')) return Promise.resolve(successTrend);
      return Promise.resolve(null);
    });
    renderPage();

    await screen.findByText('Kiditem Foundry');
    // Evidence is reached per section, not reprinted beside every value. The
    // sentence that used to sit under nine values at once is gone from the page
    // and lives behind the section's one affordance.
    expect(document.body.textContent).not.toContain('스냅샷 현재 · 기준시점');
    expect(screen.queryAllByRole('button', { name: '데이터 근거 안내' })).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /근거 안내$/ }).map((b) => b.getAttribute('aria-label')))
      .toEqual(['기간 지표 근거 안내', '스냅샷 지표 근거 안내']);
    // The enumerated dates are reachable but never printed on the page itself.
    expect(document.body).not.toHaveTextContent('2026-07-02');

    fireEvent.click(screen.getByRole('button', { name: '스냅샷 지표 근거 안내' }));
    const note = await screen.findByRole('note');
    expect(within(note).getByRole('row', { name: /셀피아 재고 0/ })).toBeInTheDocument();
    expect(within(note).getByRole('row', { name: /매칭 확인 필요/ })).toBeInTheDocument();
    // These two snapshots really do share an as-of and a source, so the
    // breakdown states each shared fact once instead of repeating it per row.
    expect(note).toHaveTextContent('기준시점 2026-07-27 · 원천 sellpia (모든 값 공통)');

    fireEvent.click(screen.getByRole('button', { name: '기간 지표 근거 안내' }));
    await waitFor(() => expect(document.body).toHaveTextContent('2026-07-02'));
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
    expect(screen.getByText('몰 주문수집')).toBeInTheDocument();
    expect(screen.getByText('쿠팡 쉽먼트')).toBeInTheDocument();
  });

  it('T6: pipeline-stats endpoint is NOT called', async () => {
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
    const allPaths = [...getParsedMock.mock.calls.map((c) => c[0]), ...getMock.mock.calls.map((c) => c[0])];
    expect(allPaths.some((p: string) => p.includes('pipeline-stats'))).toBe(false);
  });
});
