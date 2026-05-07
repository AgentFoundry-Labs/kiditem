import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ZodError } from 'zod';
import { ApiError } from '@/lib/api-error';

// Mock next/navigation BEFORE importing the page (page uses useRouter)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock dynamic charts (jsdom can't render Recharts)
vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

// Mock toast (no DOM noise)
const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: toastSuccessMock, error: toastErrorMock },
}));

// Mock apiClient — page uses .getParsed and .get
const getParsedMock = vi.fn();
const getMock = vi.fn();
const postMock = vi.fn();
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      getParsed: (path: string, schema: unknown) => getParsedMock(path, schema),
      get: (path: string) => getMock(path),
      patch: vi.fn(),
      post: (path: string, body?: unknown) => postMock(path, body),
    },
  };
});

import Dashboard from '../dashboard/page';

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
  alerts: [],
  warnings: { minusProducts: 0, lowProfitProducts: 0, highAdProducts: 0, needReorder: 0 },
};
const successTrend: unknown[] = [];
const aiActionTask = {
  id: 'task-ai-1',
  organizationId: 'organization-1',
  taskKey: 'ad_bid',
  type: 'ai',
  label: '광고 입찰 조정',
  detail: null,
  where: null,
  href: null,
  priority: 'high',
  status: 'pending',
  role: 'ad_manager',
  apiCall: { url: '/api/ad-rules', method: 'GET' },
  result: null,
  notes: [],
  activityLog: [],
  date: '2026-04-25',
  relatedProducts: [],
  assigneeUserId: null,
  assigneeUser: null,
  sourceAlert: null,
  createdAt: '2026-04-25T00:00:00.000Z',
  updatedAt: '2026-04-25T00:00:00.000Z',
};

beforeEach(() => {
  getParsedMock.mockReset();
  getMock.mockReset();
  postMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
  // Default: action-tasks endpoint via apiClient.getParsed returns []
  getParsedMock.mockImplementation((path: string) => {
    if (path === '/api/action-tasks') return Promise.resolve([]);
    return Promise.resolve(null);
  });
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

  it('T7: /api/action-tasks goes through getParsed, not get', async () => {
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
    const parsedPaths = getParsedMock.mock.calls.map((c) => c[0]);
    expect(parsedPaths).toContain('/api/action-tasks');
    expect(getMock).not.toHaveBeenCalledWith('/api/action-tasks');
  });

  it('T8: execute mutation parses the updated ActionTask response shape', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(successInv);
      if (path.startsWith('/api/dashboard/trend')) return Promise.resolve(successTrend);
      if (path === '/api/action-tasks') return Promise.resolve([aiActionTask]);
      return Promise.resolve(null);
    });
    postMock.mockResolvedValue({
      ...aiActionTask,
      status: 'done',
      result: { ok: true },
      activityLog: [
        {
          action: 'executed',
          timestamp: '2026-04-25T01:00:00.000Z',
          success: true,
        },
      ],
      updatedAt: '2026-04-25T01:00:00.000Z',
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('광고 입찰 조정')).toBeTruthy();
    });

    fireEvent.click(screen.getByTitle('실행'));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/api/action-tasks/task-ai-1/execute', {});
      expect(toastSuccessMock).toHaveBeenCalledWith('액션을 실행했습니다.');
    });
  });

  it('T9: execute mutation rejects the legacy ok envelope before success handling', async () => {
    getParsedMock.mockImplementation((path: string) => {
      if (path === '/api/dashboard/sales') return Promise.resolve(successSales);
      if (path === '/api/dashboard/ad') return Promise.resolve(successAd);
      if (path === '/api/dashboard/inventory') return Promise.resolve(successInv);
      if (path.startsWith('/api/dashboard/trend')) return Promise.resolve(successTrend);
      if (path === '/api/action-tasks') return Promise.resolve([aiActionTask]);
      return Promise.resolve(null);
    });
    postMock.mockResolvedValue({ ok: true });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('광고 입찰 조정')).toBeTruthy();
    });

    fireEvent.click(screen.getByTitle('실행'));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/api/action-tasks/task-ai-1/execute', {});
      expect(toastErrorMock).toHaveBeenCalledWith('실행에 실패했습니다.');
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
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
