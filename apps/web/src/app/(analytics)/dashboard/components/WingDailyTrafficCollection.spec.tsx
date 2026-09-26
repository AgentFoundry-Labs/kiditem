import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import {
  detectBrowserCollectionExtensionIds,
  detectExtensionId,
  sendToExtension,
} from '@/lib/extension-bridge';
import { queryKeys } from '@/lib/query-keys';
import { resolveWingTrafficCollectionRange } from '../hooks/use-wing-traffic-collection';
import { wingTrafficSourceQueryKey } from '../lib/wing-traffic-collection';
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
const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const NEXT_OPERATION_ID = '33333333-3333-4333-8333-333333333333';
const OPERATIONS_PATH = '/api/operations?kinds=advertising.wing_traffic&limit=10';
const ACCOUNTS_PATH = '/api/channels/accounts';
const START_LABEL = '일별 수집 시작';
const WEEK = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07'];

type Status = 'executing' | 'succeeded' | 'failed' | 'cancelled';

function operation(status: Status, overrides: Record<string, unknown> = {}) {
  return {
    id: OPERATION_ID,
    kind: 'advertising.wing_traffic',
    status,
    lockKeys: status === 'executing' ? [`account:${ACCOUNT_ID}`, `resource:wing-daily:${ACCOUNT_ID}`] : [],
    plan: { channelAccountId: ACCOUNT_ID, vendorId: 'A123', startDate: WEEK[0], endDate: WEEK[6], expectedDates: WEEK, maxPagesPerDay: 100, startedAt: '2026-09-08T00:00:00.000Z' },
    progress: status === 'executing' ? { current: '2026-09-03', confirmedDays: 2, plannedDays: 7, rows: 40 } : null,
    result: status === 'succeeded' ? { confirmedDates: WEEK } : null,
    window: { start: WEEK[0], end: WEEK[6] },
    errorCode: status === 'failed' ? 'SITE_REQUEST_FAILED' : status === 'cancelled' ? 'USER_CANCELLED' : null,
    errorMessage: status === 'failed' ? 'Wing 응답 오류' : null,
    startedAt: '2026-09-08T00:00:00.000Z',
    finishedAt: status === 'executing' ? null : '2026-09-08T00:05:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...overrides,
  };
}

let operations: Array<ReturnType<typeof operation>>;
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
  return vi.mocked(apiClient.get).mock.calls.filter(([path]) => path === OPERATIONS_PATH).length;
}

beforeEach(() => {
  vi.clearAllMocks();
  // 마감된 날(어제 KST) = 2026-09-07.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-08T03:00:00.000Z'));
  operations = [];
  extensionReplies = {
    ping: () => ({
      success: true,
      capabilities: { operationRuntime: true, wingDailyOperationKindsV1: true },
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
    if (path === OPERATIONS_PATH) return { operations };
    if (path.startsWith('/api/operations/')) {
      const found = operations.find((entry) => entry.id === path.slice('/api/operations/'.length));
      if (found) return { operation: found };
    }
    if (path === ACCOUNTS_PATH) {
      return [{ id: ACCOUNT_ID, channel: 'coupang', name: 'Wing', externalAccountId: null, vendorId: 'A123', sellerId: null, isPrimary: true }];
    }
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path === '/api/auth/extension-handoff') return { token: 'a'.repeat(43) };
    throw new Error(`unexpected POST ${path}`);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WingDailyTrafficCollection', () => {
  it('does not collect the previous month or open day for an empty current month', async () => {
    expect(resolveWingTrafficCollectionRange({ period: 'month', knownThrough: '2026-08-31' })).toBeNull();
    expect(resolveWingTrafficCollectionRange({ period: 'month', knownThrough: '2026-09-01' })).toMatchObject({
      startDate: '2026-09-01', endDate: '2026-09-01',
    });
    vi.setSystemTime(new Date('2026-09-01T03:00:00.000Z'));
    renderControl({ period: 'month' });

    expect(await screen.findByText(/이번 달에 마감된 영업일이 없습니다/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: START_LABEL })).toBeDisabled();
    expect(screen.getByText('수집할 기간이 없습니다.')).toBeInTheDocument();
    expect(sendToExtension).not.toHaveBeenCalled();
  });

  it('blocks a custom range longer than 92 days and asks the operator to split it', async () => {
    // 2026-06-06 through 2026-09-06 is 93 days.
    const view = renderControl({ selectedFrom: '2026-06-06', selectedTo: '2026-09-06' });

    expect(await screen.findByRole('button', { name: START_LABEL })).toBeDisabled();
    expect(screen.getByText('한 번에 최대 92일까지 수집할 수 있습니다. 기간을 나눠 주세요.')).toBeInTheDocument();
    expect(sendToExtension).not.toHaveBeenCalled();

    // 2026-06-07 through 2026-09-06 is 92 days.
    view.rerenderWith({ selectedFrom: '2026-06-07', selectedTo: '2026-09-06' });

    await waitFor(() => expect(screen.getByRole('button', { name: START_LABEL })).toBeEnabled());
    expect(screen.queryByText(/최대 92일/)).not.toBeInTheDocument();
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
    extensionReplies['operation.start'] = () => {
      operations = [operation('executing')];
      return { success: true, operationId: OPERATION_ID, reused: false };
    };
    renderControl();

    fireEvent.click(await screen.findByRole('button', { name: START_LABEL }));

    expect(await screen.findByText('수집 중 · 2026-09-01 ~ 2026-09-07')).toBeInTheDocument();
    expect(
      vi
        .mocked(sendToExtension)
        .mock.calls.map(([, message]) => message)
        .filter((message) => (message as { action: string }).action === 'operation.start'),
    ).toEqual([
      {
        action: 'operation.start',
        kind: 'advertising.wing_traffic',
        scope: { channelAccountId: ACCOUNT_ID, startDate: '2026-09-01', endDate: '2026-09-07' },
      },
    ]);
  });

  it('shows a running collection for another range with stop instead of a second start', async () => {
    operations = [operation('executing')];
    renderControl({ selectedFrom: '2026-09-02', selectedTo: '2026-09-06' });

    expect(await screen.findByTestId('wing-active-range')).toHaveTextContent(
      '현재 실행 범위: 2026-09-01 ~ 2026-09-07 · 선택한 범위와 다름',
    );
    expect(screen.getByRole('button', { name: '수집 중단' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: START_LABEL })).not.toBeInTheDocument();
    expect(sendToExtension).not.toHaveBeenCalled();
  });

  it('stops a running operation in the extension and on the server', async () => {
    operations = [operation('executing')];
    extensionReplies['operation.cancel'] = () => ({ success: true });
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path !== `/api/operations/${OPERATION_ID}/cancel`) {
        throw new Error(`unexpected POST ${path}`);
      }
      operations = [operation('cancelled')];
      return { operation: operations[0] };
    });
    renderControl();

    fireEvent.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByTestId('wing-traffic-error')).toHaveTextContent(
      '수집을 중단했습니다. 저장된 완료본은 유지됩니다.',
    );
    expect(screen.getByText('수집 중단됨')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: START_LABEL })).toBeEnabled();
  });

  it('tells the operator when the running collection shows no extension progress for 90 seconds', async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-08T03:00:00.000Z'));
    try {
      operations = [operation('executing', { progress: null })];
      renderControl();
      expect(await screen.findByRole('button', { name: '수집 중단' })).toBeEnabled();

      await act(() => vi.advanceTimersByTimeAsync(88_000));
      expect(screen.queryByText(/90초 넘게 진행 소식이 없습니다/)).not.toBeInTheDocument();
      await act(() => vi.advanceTimersByTimeAsync(3_000));

      expect(screen.getByText(/90초 넘게 진행 소식이 없습니다/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a cancelled operation as stopped, not failed', async () => {
    operations = [operation('cancelled')];
    renderControl();

    expect(await screen.findByTestId('wing-traffic-error')).toHaveTextContent(
      '수집을 중단했습니다. 저장된 완료본은 유지됩니다.',
    );
    expect(screen.getByText('수집 중단됨')).toBeInTheDocument();
    expect(screen.queryByText('최근 수집 실패')).not.toBeInTheDocument();
  });

  it('describes progress as confirmed days of the planned days', async () => {
    operations = [operation('executing')];

    renderControl();

    expect(await screen.findByText(/2일 확인 · 대상 7일/)).toBeInTheDocument();
  });

  it('while a run is live it re-reads only that run by id, and the account read is not repeated (S3)', async () => {
    operations = [operation('executing')];
    const view = renderControl();
    expect(await screen.findByRole('button', { name: '수집 중단' })).toBeEnabled();
    vi.mocked(apiClient.get).mockClear();

    await act(() => view.client.refetchQueries({ queryKey: wingTrafficSourceQueryKey }));

    expect(vi.mocked(apiClient.get).mock.calls.map(([path]) => path)).toEqual([`/api/operations/${OPERATION_ID}`]);
  });

  it('names a failed operation with its operator sentence', async () => {
    operations = [operation('failed')];

    renderControl();

    expect(await screen.findByTestId('wing-traffic-error')).toBeInTheDocument();
    expect(screen.getByText('최근 수집 실패')).toBeInTheDocument();
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
    operations = [operation('succeeded')];
    const view = renderControl();
    const invalidateQueries = vi.spyOn(view.client, 'invalidateQueries');
    expect(await screen.findByTestId('wing-latest-complete-range')).toBeInTheDocument();
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.all });

    operations = [operation('succeeded', { id: NEXT_OPERATION_ID }), operation('succeeded')];
    const refresh = screen.getByRole('button', { name: 'Wing 트래픽 상태 새로고침' });
    await waitFor(() => expect(refresh).toBeEnabled());
    fireEvent.click(refresh);

    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.all }),
    );
  });
});
