import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReadinessModal from '../ReadinessModal';
import type { ReadinessResponse } from '@kiditem/shared/readiness';

const mockApiGet = vi.hoisted(() => vi.fn());
const mockAdSyncRun = vi.hoisted(() => vi.fn());
const mockAdCampaignSyncStatus = vi.hoisted(() => ({
  data: {
    status: 'missing' as 'fresh' | 'stale' | 'incomplete' | 'missing',
    lastCompletedAt: null as string | null,
    campaignCount: 0,
  },
}));
const mockSearchParams = vi.hoisted(() => new URLSearchParams());
const mockCollectionSession = vi.hoisted(() => vi.fn());
const mockHandleCollect = vi.hoisted(() => vi.fn());
const mockReadinessCollectionState = vi.hoisted(() => ({
  activeSession: null as null | {
    runId: string;
    producer: 'dashboard.wing_sales';
    classification: 'background_preferred';
    status: 'running';
    attempt: number;
    restartStrategy: 'web';
    progress: {
      current: number;
      total: number;
      completed: number;
      failed: number;
      label: string;
    };
    inputIdentity: { trigger: string };
    attention: null;
    startedAt: number;
    updatedAt: number;
    finishedAt: null;
  },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/hooks/useBrowserCollectionSession', () => ({
  useBrowserCollectionSession: mockCollectionSession,
}));

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

vi.mock('@/components/readiness/useAdCampaignSyncStatus', () => ({
  useAdCampaignSyncStatus: () => mockAdCampaignSyncStatus,
}));

vi.mock('@/hooks/useSellpiaInventoryFreshness', () => ({
  useSellpiaInventoryFreshness: () => ({
    state: null,
    requestRefresh: vi.fn(),
  }),
}));

vi.mock('../readiness/useReadinessCollection', () => ({
  useReadinessCollection: () => ({
    pendingKey: null,
    handleCollect: mockHandleCollect,
    activeSession: mockReadinessCollectionState.activeSession,
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
      queries: { retry: false, staleTime: 60_000 },
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
    mockAdCampaignSyncStatus.data = {
      status: 'missing',
      lastCompletedAt: null,
      campaignCount: 0,
    };
    mockCollectionSession.mockReset();
    mockCollectionSession.mockReturnValue({ data: null });
    mockHandleCollect.mockReset();
    mockReadinessCollectionState.activeSession = null;
    mockSearchParams.delete('collectionRun');
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

  it('marks only server-confirmed dates green in the daily status strip', async () => {
    const response = makeReadinessResponse();
    mockApiGet.mockResolvedValue({
      ...response,
      checks: [
        {
          ...response.checks[0],
          expectedDates: ['2026-05-20', '2026-05-21'],
          missingDates: ['2026-05-21'],
        },
        response.checks[1],
      ],
    });

    const view = render(<ReadinessModal open onClose={vi.fn()} />, {
      wrapper: wrapper(),
    });
    fireEvent.click(
      await screen.findByRole('button', {
        name: '일별 매출 날짜별 현황 보기',
      }),
    );

    expect(view.container.querySelector('[title="2026-05-20"]')).toHaveClass(
      'bg-emerald-500',
    );
    expect(view.container.querySelector('[title="2026-05-21"]')).toHaveClass(
      'bg-rose-500',
    );
  });

  it('shows server-confirmed daily coverage for a completed ad check', async () => {
    const response = makeReadinessResponse();
    mockApiGet.mockResolvedValue({
      ...response,
      checks: [
        response.checks[0],
        {
          ...response.checks[1],
          expectedDates: ['2026-05-19', '2026-05-20'],
          missingDates: [],
        },
      ],
    });

    const view = render(<ReadinessModal open onClose={vi.fn()} />, {
      wrapper: wrapper(),
    });
    fireEvent.click(
      await screen.findByRole('button', {
        name: '광고 성과 날짜별 현황 보기',
      }),
    );

    expect(view.container.querySelector('[title="2026-05-19"]')).toHaveClass(
      'bg-emerald-500',
    );
    expect(view.container.querySelector('[title="2026-05-20"]')).toHaveClass(
      'bg-emerald-500',
    );
  });

  it('fetches fresh readiness when a controlled modal is reopened', async () => {
    const onClose = vi.fn();
    const queryClient = makeQueryClient();
    queryClient.setQueryData(['readiness'], makeReadinessResponse());
    const view = render(<ReadinessModal open={false} onClose={onClose} />, {
      wrapper: wrapper(queryClient),
    });

    expect(mockApiGet).not.toHaveBeenCalled();
    view.rerender(<ReadinessModal open onClose={onClose} />);

    expect(await screen.findByRole('button', { name: '대시보드 열기' })).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledTimes(1);

    view.rerender(<ReadinessModal open={false} onClose={onClose} />);
    view.rerender(<ReadinessModal open onClose={onClose} />);
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(2));
  });

  it('does not render the retired Rocket row from a cached readiness response', async () => {
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

    const openDashboard = await screen.findByRole('button', { name: '대시보드 열기' });
    expect(screen.queryByText('쿠팡 로켓')).not.toBeInTheDocument();
    expect(screen.queryByText('조회 전용')).not.toBeInTheDocument();
    await waitFor(() => expect(openDashboard).toBeEnabled());
  });

  it('opens from collectionRun and renders explicit browser controls', async () => {
    const runId = '11111111-1111-4111-8111-111111111111';
    mockSearchParams.set('collectionRun', runId);
    mockCollectionSession.mockReturnValue({
      data: {
        runId,
        producer: 'dashboard.wing_sales',
        classification: 'background_preferred',
        status: 'attention_required',
        attempt: 1,
        restartStrategy: 'web',
        progress: {
          current: 1,
          total: 2,
          completed: 0,
          failed: 0,
          label: 'Wing 로그인 확인',
        },
        inputIdentity: { trigger: 'readiness' },
        attention: {
          reason: 'marketplace_login',
          message: 'Wing 로그인이 필요합니다.',
          canOpenTab: true,
        },
        startedAt: 1_700_000_000_000,
        updatedAt: 1_700_000_001_000,
        finishedAt: null,
      },
    });

    render(<ReadinessModal autoOpenWhen="collectionIssue" />, {
      wrapper: wrapper(),
    });

    expect(await screen.findByText('Wing 로그인이 필요합니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '확인 탭 열기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '처음부터 재실행' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '중단' })).toBeInTheDocument();
    expect(mockCollectionSession).toHaveBeenCalledWith(runId);

    fireEvent.click(screen.getByRole('button', { name: '처음부터 재실행' }));
    await waitFor(() => {
      expect(mockHandleCollect).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'wing_sales' }),
        runId,
      );
    });
  });

  it('renders stop controls for a collection started directly from the modal', async () => {
    mockReadinessCollectionState.activeSession = {
      runId: '22222222-2222-4222-8222-222222222222',
      producer: 'dashboard.wing_sales',
      classification: 'background_preferred',
      status: 'running',
      attempt: 1,
      restartStrategy: 'web',
      progress: {
        current: 3,
        total: 10,
        completed: 3,
        failed: 0,
        label: 'Wing 매출 수집',
      },
      inputIdentity: { trigger: 'readiness' },
      attention: null,
      startedAt: 1_700_000_000_000,
      updatedAt: 1_700_000_001_000,
      finishedAt: null,
    };

    render(<ReadinessModal open onClose={vi.fn()} />, { wrapper: wrapper() });

    expect(await screen.findByText('진행 3 / 10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '중단' })).toBeInTheDocument();
  });

  it('does not pass a React click event as the ad-sync run id', async () => {
    render(<ReadinessModal open onClose={vi.fn()} />, { wrapper: wrapper() });

    fireEvent.click(await screen.findByRole('button', { name: '광고 동기화' }));

    expect(mockAdSyncRun).toHaveBeenCalledWith();
  });

  it('shows 최신 only for a server-confirmed complete daily ad sweep', async () => {
    mockAdCampaignSyncStatus.data = {
      status: 'fresh',
      lastCompletedAt: new Date().toISOString(),
      campaignCount: 9,
    };

    const view = render(<ReadinessModal open onClose={vi.fn()} />, {
      wrapper: wrapper(),
    });

    expect(await screen.findByText('최신')).toBeInTheDocument();
    expect(view.container).toHaveTextContent('마지막 완료');

    mockAdCampaignSyncStatus.data = {
      status: 'stale',
      lastCompletedAt: null,
      campaignCount: 9,
    };
    view.rerender(<ReadinessModal open onClose={vi.fn()} />);

    expect(screen.queryByText('최신')).not.toBeInTheDocument();
  });
});
