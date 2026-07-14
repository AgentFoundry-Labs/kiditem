import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReadinessModal from '../ReadinessModal';
import type { ReadinessResponse } from '@kiditem/shared/readiness';

const mockApiGet = vi.hoisted(() => vi.fn());
const mockAdSyncRun = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: mockApiGet,
    post: vi.fn(),
  },
}));

vi.mock('@/app/(advertising)/ad-ops/hooks/useAdSync', () => ({
  useAdSync: () => ({
    loading: false,
    run: mockAdSyncRun,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

const TODAY_DISMISSED_KEY = 'kiditem.readiness.dismissedDate';
const SESSION_DISMISSED_KEY = 'kiditem.readiness.dismissed';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function wrapper(queryClient = makeQueryClient()) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function makeReadinessResponse(): ReadinessResponse {
  return {
    allOk: false,
    checks: [
      {
        key: 'wing_sales',
        label: 'Wing 매출',
        status: 'missing',
        detail: '어제 주문 데이터 없음',
        lastSyncedAt: null,
        count: null,
        collector: 'extension',
        collectEndpoint: null,
        scrapeUrls: ['https://wing.coupang.com/orders'],
        referenceDate: '2026-05-21',
        expectedDates: ['2026-05-21'],
        missingDates: ['2026-05-21'],
      },
      {
        key: 'coupang_ads',
        label: '쿠팡 광고',
        status: 'ok',
        detail: '광고 데이터 최신',
        lastSyncedAt: '2026-05-21T00:00:00.000Z',
        count: 1,
        collector: 'extension',
        collectEndpoint: null,
        scrapeUrls: null,
        referenceDate: '2026-05-21',
        expectedDates: ['2026-05-21'],
        missingDates: [],
      },
    ],
  };
}

describe('ReadinessModal', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiGet.mockResolvedValue(makeReadinessResponse());
    mockAdSyncRun.mockReset();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('lets the user suppress the automatic readiness modal for today', async () => {
    render(<ReadinessModal autoOpenWhen="collectionIssue" />, { wrapper: wrapper() });

    const dismissButton = await screen.findByRole('button', { name: '오늘 하루 보지 않기' });
    fireEvent.click(dismissButton);

    expect(localStorage.getItem(TODAY_DISMISSED_KEY)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sessionStorage.getItem(SESSION_DISMISSED_KEY)).toBe('1');
    expect(screen.queryByRole('button', { name: '오늘 하루 보지 않기' })).not.toBeInTheDocument();
  });

  it('does not auto-open again when today has already been dismissed', async () => {
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    localStorage.setItem(TODAY_DISMISSED_KEY, dateKey);

    render(<ReadinessModal autoOpenWhen="collectionIssue" />, { wrapper: wrapper() });

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/api/readiness'));
    expect(screen.queryByRole('button', { name: '오늘 하루 보지 않기' })).not.toBeInTheDocument();
  });

  it('respects session dismissal for collection-issue auto-open mode', async () => {
    sessionStorage.setItem(SESSION_DISMISSED_KEY, '1');

    render(<ReadinessModal autoOpenWhen="collectionIssue" />, { wrapper: wrapper() });

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/api/readiness'));
    expect(screen.queryByRole('button', { name: '오늘 하루 보지 않기' })).not.toBeInTheDocument();
  });

  it('still opens when controlled by an explicit user action', async () => {
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    localStorage.setItem(TODAY_DISMISSED_KEY, dateKey);

    render(<ReadinessModal open onClose={vi.fn()} />, { wrapper: wrapper() });

    expect(await screen.findByRole('button', { name: '대시보드 열기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '오늘 하루 보지 않기' })).not.toBeInTheDocument();
  });

  it('does not expose a Rocket sales action without a supported ingestion endpoint', async () => {
    const response = makeReadinessResponse();
    mockApiGet.mockResolvedValue({
      ...response,
      checks: [
        {
          ...response.checks[0],
          key: 'rocket_sales',
          label: '쿠팡 로켓 매출',
        },
      ],
    });

    render(<ReadinessModal open onClose={vi.fn()} />, { wrapper: wrapper() });

    expect(await screen.findByText('조회 전용')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '매출 동기화' })).not.toBeInTheDocument();
  });
});
