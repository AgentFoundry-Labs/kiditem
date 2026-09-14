import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdTrafficSourceAttempt, AdTrafficSourceStatus } from '@kiditem/shared/advertising';
import { apiClient } from '@/lib/api-client';
import {
  detectBrowserCollectionExtensionIds,
  detectExtensionId,
  sendToExtension,
} from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { resolveWingTrafficCollectionRange } from '../hooks/use-wing-traffic-collection';
import { WingDailyTrafficCollection } from './WingDailyTrafficCollection';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  detectBrowserCollectionExtensionIds: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const EXTENSION_ID = 'kiditem-extension';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const NEXT_ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const SOURCE_PATH = '/api/ads/traffic/source';
const START_LABEL = '일별 수집 시작';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function attempt(
  state: 'RUNNING' | 'COMPLETE' | 'FAILED',
  overrides: Partial<AdTrafficSourceAttempt> = {},
): AdTrafficSourceAttempt {
  return {
    attemptId: ATTEMPT_ID,
    channelAccountId: ACCOUNT_ID,
    state,
    plan: {
      sourceType: 'coupang_wing_traffic',
      parserVersion: 'wing-traffic-v1',
      channelAccountId: ACCOUNT_ID,
      expectedAdvertiserId: 'A123',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      businessDate: '2026-09-01',
      periodDays: 7,
      targetUrl: 'https://wing.coupang.com/tenants/business-insight/sales-analysis',
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
    actualCutoffAt: state === 'COMPLETE' ? '2026-09-08T00:00:00.000Z' : null,
    manifestChecksum: 'a'.repeat(64),
    rowCount: 0,
    matchedRowCount: 0,
    unmatchedRowCount: 0,
    receiptCount: state === 'RUNNING' ? 2 : 7,
    expectedPages: 7,
    terminalPageObserved: state === 'COMPLETE',
    errorCode: state === 'FAILED' ? 'PROVIDER_FAILED' : null,
    errorMessage: state === 'FAILED' ? 'Wing 응답 오류' : null,
    ...overrides,
  };
}

function source(
  latestAttempt: AdTrafficSourceAttempt | null,
  latestComplete: AdTrafficSourceAttempt | null = latestAttempt?.state === 'COMPLETE'
    ? latestAttempt
    : null,
): AdTrafficSourceStatus {
  return {
    channelAccountId: ACCOUNT_ID,
    knownThrough: '2026-09-07',
    ready: latestComplete !== null,
    latestAttempt,
    latestComplete,
    actualCutoffAt: latestComplete?.actualCutoffAt ?? null,
  };
}

let serverStatus: AdTrafficSourceStatus;
let extensionReplies: Record<string, (message: Record<string, unknown>) => unknown>;

function renderControl(props: Partial<React.ComponentProps<typeof WingDailyTrafficCollection>> = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  const element = (overrides: typeof props) =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(WingDailyTrafficCollection, {
        period: 'custom',
        selectedFrom: '2026-09-01',
        selectedTo: '2026-09-07',
        ...overrides,
      }),
    );
  const view = render(element(props));
  return { ...view, client, rerenderWith: (overrides: typeof props) => view.rerender(element(overrides)) };
}

function sourceReads(): number {
  return vi.mocked(apiClient.get).mock.calls.filter(([path]) => path === SOURCE_PATH).length;
}

beforeEach(() => {
  vi.clearAllMocks();
  serverStatus = source(null);
  extensionReplies = {
    ping: () => ({
      success: true,
      capabilities: { kiditemEnvironmentProfilesV1: true, collectionStartV1: true },
    }),
    setAuthToken: () => ({ success: true }),
  };
  vi.mocked(detectExtensionId).mockResolvedValue(EXTENSION_ID);
  vi.mocked(detectBrowserCollectionExtensionIds).mockResolvedValue([EXTENSION_ID]);
  vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) => {
    const action = (message as { action: string }).action;
    const reply = extensionReplies[action];
    if (!reply) throw new Error(`unexpected extension action ${action}`);
    return reply(message as Record<string, unknown>);
  });
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === SOURCE_PATH) return serverStatus;
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path === '/api/auth/extension-handoff') return { token: 'a'.repeat(43) };
    throw new Error(`unexpected POST ${path}`);
  });
});

describe('WingDailyTrafficCollection', () => {
  it('does not collect the previous month or open day for an empty current month', async () => {
    expect(resolveWingTrafficCollectionRange({ period: 'month', knownThrough: '2026-08-31' })).toBeNull();
    expect(resolveWingTrafficCollectionRange({ period: 'month', knownThrough: '2026-09-01' })).toMatchObject({
      startDate: '2026-09-01', endDate: '2026-09-01',
    });
    serverStatus = { ...source(null), knownThrough: '2026-08-31' };
    renderControl({ period: 'month' });

    expect(await screen.findByText(/이번 달에 마감된 영업일이 없습니다/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: START_LABEL })).toBeDisabled();
    expect(screen.getByText('수집할 기간이 없습니다.')).toBeInTheDocument();
    expect(sendToExtension).not.toHaveBeenCalled();
  });

  it('uses a closed KST range ending yesterday when no custom dates are selected', () => {
    expect(resolveWingTrafficCollectionRange({
      period: 'week',
      knownThrough: '2026-09-07',
    })).toMatchObject({
      startDate: '2026-09-01',
      endDate: '2026-09-07',
    });
  });

  it('reads on mount and date changes without starting a collection', async () => {
    const view = renderControl();
    expect(await screen.findByRole('button', { name: START_LABEL })).toBeEnabled();

    view.rerenderWith({ selectedFrom: '2026-09-02', selectedTo: '2026-09-06' });

    expect(screen.getByText(/2026-09-02 ~ 2026-09-06/)).toBeInTheDocument();
    expect(sendToExtension).not.toHaveBeenCalled();
  });

  it('refreshes only the server-owned status when requested', async () => {
    renderControl();
    const refresh = screen.getByRole('button', { name: 'Wing 트래픽 상태 새로고침' });
    await waitFor(() => {
      expect(sourceReads()).toBe(1);
      expect(refresh).toBeEnabled();
    });

    fireEvent.click(refresh);

    await waitFor(() => expect(sourceReads()).toBe(2));
    expect(sendToExtension).not.toHaveBeenCalled();
  });

  it('starts the selected range through the start contract and shows the owner range while running', async () => {
    extensionReplies.startCollection = (message) => {
      serverStatus = source(attempt('RUNNING'));
      return { success: true, outcome: 'started', producer: message.producer, attemptId: ATTEMPT_ID };
    };
    renderControl();

    fireEvent.click(await screen.findByRole('button', { name: START_LABEL }));

    expect(await screen.findByText('수집 중 · 2026-09-01 ~ 2026-09-07')).toBeInTheDocument();
    expect(
      vi
        .mocked(sendToExtension)
        .mock.calls.map(([, message]) => message)
        .filter((message) => (message as { action: string }).action === 'startCollection'),
    ).toEqual([
      {
        action: 'startCollection',
        producer: 'dashboard.wing_sales',
        idempotencyKey: expect.stringMatching(UUID),
        scope: { startDate: '2026-09-01', endDate: '2026-09-07' },
      },
    ]);
    expect(vi.mocked(apiClient.post).mock.calls.map(([path]) => path)).toEqual([
      '/api/auth/extension-handoff',
    ]);
  });

  it('shows a running collection for another range with stop instead of a second start', async () => {
    serverStatus = source(attempt('RUNNING'));
    renderControl({ selectedFrom: '2026-09-02', selectedTo: '2026-09-06' });

    expect(await screen.findByTestId('wing-active-range')).toHaveTextContent(
      '현재 실행 범위: 2026-09-01 ~ 2026-09-07 · 선택한 범위와 다름',
    );
    expect(screen.getByRole('button', { name: '수집 중단' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: START_LABEL })).not.toBeInTheDocument();
    expect(sendToExtension).not.toHaveBeenCalled();
  });

  it('stops a running collection through the traffic owner route when the extension holds no session', async () => {
    serverStatus = source(attempt('RUNNING'));
    extensionReplies.cancelCollectionSession = () => ({
      success: false,
      error: 'Collection session not found',
    });
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path !== `/api/ads/traffic/attempts/${ATTEMPT_ID}/cancel`) {
        throw new Error(`unexpected POST ${path}`);
      }
      const cancelled = attempt('FAILED', {
        errorCode: 'USER_CANCELLED',
        errorMessage: '운영자가 수집을 중단했습니다.',
      });
      serverStatus = source(cancelled);
      return cancelled;
    });
    renderControl();

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByTestId('wing-traffic-error')).toHaveTextContent(
      '수집을 중단했습니다. 저장된 완료본은 유지됩니다.',
    );
    expect(screen.getByText('수집 중단됨')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: START_LABEL })).toBeEnabled();
  });

  it('describes daily-v2 progress as source chunks and target days', async () => {
    const dailyV2 = attempt('RUNNING', {
      expectedPages: null,
      plan: {
        ...attempt('RUNNING').plan,
        parserVersion: 'wing-traffic-daily-v2',
        providerVendorId: 'A123',
        businessDate: '2026-09-07',
        expectedDates: [
          '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
          '2026-09-05', '2026-09-06', '2026-09-07',
        ],
        filterScope: 'ALL_NORMAL_RFM',
      },
    });
    serverStatus = source(dailyV2);

    renderControl();

    expect(await screen.findByText(/2개 일별 데이터 확인/)).toBeInTheDocument();
    expect(screen.getByText(/대상 7일/)).toBeInTheDocument();
    expect(screen.queryByText(/페이지 확인됨/)).not.toBeInTheDocument();
  });

  it('blocks collection while no status has ever been read', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('status read failed'));

    renderControl();

    expect(await screen.findByRole('button', { name: '상태 확인 필요' })).toBeDisabled();
    expect(screen.getByText('수집 상태를 불러오지 못했습니다.')).toBeInTheDocument();
  });

  it('keeps acting on the last known status when a later status read fails', async () => {
    renderControl();
    const refresh = screen.getByRole('button', { name: 'Wing 트래픽 상태 새로고침' });
    expect(await screen.findByRole('button', { name: START_LABEL })).toBeEnabled();
    await waitFor(() => expect(refresh).toBeEnabled());

    vi.mocked(apiClient.get).mockRejectedValue(new Error('status read failed'));
    fireEvent.click(refresh);

    expect(await screen.findByText('상태를 다시 확인하는 중')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: START_LABEL })).toBeEnabled();
    expect(screen.queryByText('수집 상태를 불러오지 못했습니다.')).not.toBeInTheDocument();
  });

  it('refreshes dashboard reads only when a new traffic collection completes', async () => {
    serverStatus = source(attempt('COMPLETE'));
    const view = renderControl();
    const invalidateQueries = vi.spyOn(view.client, 'invalidateQueries');
    expect(await screen.findByTestId('wing-latest-complete-range')).toBeInTheDocument();
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.all });

    serverStatus = source(attempt('COMPLETE', { attemptId: NEXT_ATTEMPT_ID }));
    const refresh = screen.getByRole('button', { name: 'Wing 트래픽 상태 새로고침' });
    await waitFor(() => expect(refresh).toBeEnabled());
    fireEvent.click(refresh);

    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.all }),
    );
  });
});
