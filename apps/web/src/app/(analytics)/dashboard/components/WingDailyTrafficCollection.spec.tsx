import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import {
  cancelWingTrafficSource,
  collectWingTrafficSource,
  readWingTrafficSource,
} from '../lib/wing-traffic-source-owner';
import { resolveWingTrafficCollectionRange } from '../hooks/use-wing-traffic-collection';
import { WingDailyTrafficCollection } from './WingDailyTrafficCollection';
import type { AdTrafficSourceAttempt, AdTrafficSourceStatus } from '@kiditem/shared/advertising';

vi.mock('../lib/wing-traffic-source-owner', async () => {
  const actual = await vi.importActual<typeof import('../lib/wing-traffic-source-owner')>(
    '../lib/wing-traffic-source-owner',
  );
  return {
    ...actual,
    cancelWingTrafficSource: vi.fn(),
    collectWingTrafficSource: vi.fn(),
    readWingTrafficSource: vi.fn(),
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

function attempt(
  state: 'RUNNING' | 'COMPLETE' | 'FAILED',
  overrides: Partial<AdTrafficSourceAttempt> = {},
): AdTrafficSourceAttempt {
  return {
    attemptId: '11111111-1111-4111-8111-111111111111',
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
  latestComplete: AdTrafficSourceAttempt | null = null,
): AdTrafficSourceStatus {
  return {
    channelAccountId: ACCOUNT_ID,
    knownThrough: '2026-09-07',
    ready: latestComplete !== null,
    latestAttempt,
    latestComplete,
    actualCutoffAt: latestComplete?.actualCutoffAt ?? null,
  } as const;
}

function renderControl(props: Partial<React.ComponentProps<typeof WingDailyTrafficCollection>> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const view = render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(WingDailyTrafficCollection, {
        period: 'custom',
        selectedFrom: '2026-09-01',
        selectedTo: '2026-09-07',
        ...props,
      }),
    ),
  );
  return { ...view, client };
}

beforeEach(() => {
  vi.mocked(readWingTrafficSource).mockResolvedValue(source(null));
  vi.mocked(cancelWingTrafficSource).mockReset();
  vi.mocked(collectWingTrafficSource).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('WingDailyTrafficCollection', () => {
  it('does not collect the previous month or open day for an empty current month', async () => {
    expect(resolveWingTrafficCollectionRange({ period: 'month', knownThrough: '2026-08-31' })).toBeNull();
    expect(resolveWingTrafficCollectionRange({ period: 'month', knownThrough: '2026-09-01' })).toMatchObject({
      startDate: '2026-09-01', endDate: '2026-09-01',
    });
    vi.mocked(readWingTrafficSource).mockResolvedValue({ ...source(null), knownThrough: '2026-08-31' });
    renderControl({ period: 'month' });
    await waitFor(() => expect(screen.getByText(/이번 달에 마감된 영업일이 없습니다/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '일별 수집 시작' })).toBeDisabled();
    expect(collectWingTrafficSource).not.toHaveBeenCalled();
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
    await waitFor(() => expect(screen.getByText('Wing 일별 트래픽')).toBeInTheDocument());
    expect(collectWingTrafficSource).not.toHaveBeenCalled();

    view.rerender(
      createElement(
        QueryClientProvider,
        { client: view.client },
        createElement(WingDailyTrafficCollection, {
          period: 'custom',
          selectedFrom: '2026-09-02',
          selectedTo: '2026-09-06',
        }),
      ),
    );
    expect(collectWingTrafficSource).not.toHaveBeenCalled();
    expect(screen.getByText(/2026-09-02 ~ 2026-09-06/)).toBeInTheDocument();
  });

  it('refreshes only the server-owned status when requested', async () => {
    renderControl();
    const refresh = screen.getByRole('button', { name: 'Wing 트래픽 상태 새로고침' });
    await waitFor(() => {
      expect(readWingTrafficSource).toHaveBeenCalledTimes(1);
      expect(refresh).toBeEnabled();
    });

    fireEvent.click(refresh);

    await waitFor(() => expect(readWingTrafficSource).toHaveBeenCalledTimes(2));
    expect(collectWingTrafficSource).not.toHaveBeenCalled();
  });

  it('does not invalidate dashboard data when the first source payload is already complete', async () => {
    const completed = attempt('COMPLETE');
    vi.mocked(readWingTrafficSource).mockResolvedValue(source(completed, completed));
    const view = renderControl();
    const invalidateQueries = vi.spyOn(view.client, 'invalidateQueries');

    await waitFor(() => expect(screen.getByTestId('wing-latest-complete-range')).toBeInTheDocument());
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.all });
    view.unmount();
  });

  it('starts an explicit requested range and discloses the owner range while running', async () => {
    const completed = attempt('COMPLETE');
    vi.mocked(collectWingTrafficSource).mockResolvedValue({
      attempt: completed,
      release: 'terminal',
      extensionReply: null,
    } as never);
    const view = renderControl();
    await waitFor(() => expect(screen.getByTestId('wing-traffic-collect')).toBeEnabled());

    fireEvent.click(screen.getByTestId('wing-traffic-collect'));
    await waitFor(() => expect(collectWingTrafficSource).toHaveBeenCalledTimes(1));
    expect(collectWingTrafficSource).toHaveBeenCalledWith({
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      url: 'https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-01&end_date=2026-09-07',
    }, { signal: expect.any(AbortSignal) });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
      'Wing 일별 트래픽 수집 완료 · 2026-09-01 ~ 2026-09-07',
    ));
    view.unmount();
  });

  it('releases the button for an unresponsive extension, then shows its late failure until the attempt progresses', async () => {
    const running = attempt('RUNNING', { receiptCount: 0 });
    let answer!: (reply: { ok: false; message: string }) => void;
    const extensionReply = new Promise<{ ok: false; message: string }>((resolve) => {
      answer = resolve;
    });
    vi.mocked(collectWingTrafficSource).mockImplementation(async () => {
      vi.mocked(readWingTrafficSource).mockResolvedValue(source(running));
      return { attempt: running, release: 'extension-unresponsive', extensionReply } as never;
    });
    const view = renderControl();
    await waitFor(() => expect(screen.getByTestId('wing-traffic-collect')).toBeEnabled());

    fireEvent.click(screen.getByTestId('wing-traffic-collect'));

    await waitFor(() => expect(screen.getByTestId('wing-traffic-extension-notice'))
      .toHaveTextContent('확장이 응답하지 않습니다'));
    expect(screen.getByTestId('wing-traffic-collect')).toBeEnabled();
    expect(screen.getByTestId('wing-traffic-collect')).toHaveTextContent('이어서 수집');
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('확장이 응답하지 않습니다'));

    answer({ ok: false, message: 'Wing 로그인이 필요합니다.' });
    await waitFor(() => expect(screen.getByTestId('wing-traffic-extension-notice'))
      .toHaveTextContent('Wing 로그인이 필요합니다.'));
    expect(toast.error).toHaveBeenCalledWith('Wing 로그인이 필요합니다.');

    vi.mocked(readWingTrafficSource).mockResolvedValue(source({ ...running, receiptCount: 1 }));
    const refresh = screen.getByRole('button', { name: 'Wing 트래픽 상태 새로고침' });
    await waitFor(() => expect(refresh).toBeEnabled());
    fireEvent.click(refresh);
    await waitFor(() => expect(screen.queryByTestId('wing-traffic-extension-notice')).not.toBeInTheDocument());
    view.unmount();
  });

  it('shows an extension failure reply instead of swallowing it', async () => {
    const running = attempt('RUNNING', { receiptCount: 0 });
    vi.mocked(collectWingTrafficSource).mockImplementation(async () => {
      vi.mocked(readWingTrafficSource).mockResolvedValue(source(running));
      return {
        attempt: running,
        release: 'extension-failed',
        failure: '다른 Wing 트래픽 수집이 진행 중입니다.',
        extensionReply: Promise.resolve({ ok: false, message: '다른 Wing 트래픽 수집이 진행 중입니다.' }),
      } as never;
    });
    const view = renderControl();
    await waitFor(() => expect(screen.getByTestId('wing-traffic-collect')).toBeEnabled());

    fireEvent.click(screen.getByTestId('wing-traffic-collect'));

    await waitFor(() => expect(screen.getByTestId('wing-traffic-extension-notice'))
      .toHaveTextContent('다른 Wing 트래픽 수집이 진행 중입니다.'));
    expect(toast.error).toHaveBeenCalledWith('다른 Wing 트래픽 수집이 진행 중입니다.');
    expect(screen.getByTestId('wing-traffic-collect')).toBeEnabled();
    view.unmount();
  });

  it('does not resume a running attempt after the selected range changes', async () => {
    vi.mocked(readWingTrafficSource).mockResolvedValue(source(attempt('RUNNING')));
    const view = renderControl({ selectedFrom: '2026-09-02', selectedTo: '2026-09-06' });
    await waitFor(() => expect(screen.getByTestId('wing-active-range')).toBeInTheDocument());
    expect(screen.getByTestId('wing-active-range')).toHaveTextContent(
      '현재 실행 범위: 2026-09-01 ~ 2026-09-07',
    );
    expect(screen.getByTestId('wing-active-range')).toHaveTextContent('선택한 범위와 달라 이어받지 않음');

    fireEvent.click(screen.getByTestId('wing-traffic-collect'));
    await waitFor(() => expect(screen.getByTestId('wing-traffic-action-error')).toBeInTheDocument());
    expect(collectWingTrafficSource).not.toHaveBeenCalled();
    view.unmount();
  });

  it('keeps the owner-backed stop control visible for a running attempt', async () => {
    const running = attempt('RUNNING');
    const cancelled = {
      ...attempt('FAILED'),
      errorCode: 'USER_CANCELLED',
      errorMessage: '사용자가 Wing 트래픽 수집을 중단했습니다.',
    };
    vi.mocked(readWingTrafficSource).mockResolvedValue(source(running));
    vi.mocked(cancelWingTrafficSource).mockResolvedValue(cancelled as never);

    const view = renderControl();
    await waitFor(() => expect(screen.getByTestId('wing-traffic-cancel')).toBeVisible());

    fireEvent.click(screen.getByTestId('wing-traffic-cancel'));

    await waitFor(() => expect(cancelWingTrafficSource).toHaveBeenCalledWith(
      running.attemptId,
      running.plan.parserVersion,
    ));
    expect(screen.getByTestId('wing-traffic-cancel')).toBeInTheDocument();
    view.unmount();
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
    vi.mocked(readWingTrafficSource).mockResolvedValue(source(dailyV2));

    const view = renderControl();

    await waitFor(() => expect(screen.getByText(/2개 일별 데이터 확인/)).toBeInTheDocument());
    expect(screen.getByText(/대상 7일/)).toBeInTheDocument();
    expect(screen.queryByText(/페이지 확인됨/)).not.toBeInTheDocument();
    view.unmount();
  });

  it('blocks collection while no status has ever been read', async () => {
    vi.mocked(readWingTrafficSource).mockRejectedValue(new Error('status read failed'));
    const view = renderControl();

    await waitFor(() => expect(screen.getByText('Wing 수집 상태를 불러오지 못했습니다.')).toBeInTheDocument());
    expect(screen.getByTestId('wing-traffic-collect')).toBeDisabled();
    expect(screen.getByTestId('wing-traffic-collect')).toHaveTextContent('상태 확인 필요');
    view.unmount();
  });

  it('keeps acting on the last known status when a later status read fails', async () => {
    const view = renderControl();
    const refresh = screen.getByRole('button', { name: 'Wing 트래픽 상태 새로고침' });
    await waitFor(() => {
      expect(screen.getByTestId('wing-traffic-collect')).toBeEnabled();
      expect(refresh).toBeEnabled();
    });

    vi.mocked(readWingTrafficSource).mockRejectedValue(new Error('status read failed'));
    fireEvent.click(refresh);

    await waitFor(() => expect(screen.getByText('상태를 다시 확인하는 중')).toBeInTheDocument());
    expect(screen.getByTestId('wing-traffic-collect')).toBeEnabled();
    expect(screen.getByTestId('wing-traffic-collect')).toHaveTextContent('일별 수집 시작');
    expect(screen.queryByText('Wing 수집 상태를 불러오지 못했습니다.')).not.toBeInTheDocument();
    view.unmount();
  });

  it('stops waiting for the release when the dashboard unmounts', async () => {
    let received: AbortSignal | undefined;
    vi.mocked(collectWingTrafficSource).mockImplementation(async (_request, options) => {
      received = options?.signal;
      return new Promise<never>(() => undefined);
    });
    const view = renderControl();
    await waitFor(() => expect(screen.getByTestId('wing-traffic-collect')).toBeEnabled());

    fireEvent.click(screen.getByTestId('wing-traffic-collect'));
    await waitFor(() => expect(received).toBeDefined());
    expect(received?.aborted).toBe(false);

    view.unmount();
    expect(received?.aborted).toBe(true);
  });

  function deferredReply() {
    let answer!: (reply: { ok: false; message: string }) => void;
    const reply = new Promise<{ ok: false; message: string }>((resolve) => {
      answer = resolve;
    });
    return { reply, answer };
  }

  function unresponsiveOutcome(extensionReply: Promise<unknown>) {
    const running = attempt('RUNNING', { receiptCount: 0 });
    vi.mocked(readWingTrafficSource).mockResolvedValue(source(running));
    return { attempt: running, release: 'extension-unresponsive', extensionReply } as never;
  }

  it('announces a late extension reply only for the newest request', async () => {
    const first = deferredReply();
    const second = deferredReply();
    vi.mocked(collectWingTrafficSource)
      .mockImplementationOnce(async () => unresponsiveOutcome(first.reply))
      .mockImplementationOnce(async () => unresponsiveOutcome(second.reply));
    const view = renderControl();
    const collectButton = () => screen.getByTestId('wing-traffic-collect');
    await waitFor(() => expect(collectButton()).toBeEnabled());

    fireEvent.click(collectButton());
    await waitFor(() => {
      expect(collectButton()).toHaveTextContent('이어서 수집');
      expect(collectButton()).toBeEnabled();
    });
    fireEvent.click(collectButton());
    await waitFor(() => expect(collectWingTrafficSource).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(collectButton()).toBeEnabled());

    first.answer({ ok: false, message: '이전 요청의 늦은 실패' });
    second.answer({ ok: false, message: '최신 요청의 늦은 실패' });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('최신 요청의 늦은 실패'));
    expect(toast.error).not.toHaveBeenCalledWith('이전 요청의 늦은 실패');
    view.unmount();
  });

  it('drops the late extension reply once a cancel is confirmed', async () => {
    const late = deferredReply();
    const cancelled = {
      ...attempt('FAILED'),
      errorCode: 'USER_CANCELLED',
      errorMessage: '사용자가 Wing 트래픽 수집을 중단했습니다.',
    };
    vi.mocked(collectWingTrafficSource).mockImplementation(async () => unresponsiveOutcome(late.reply));
    vi.mocked(cancelWingTrafficSource).mockImplementation(async () => {
      vi.mocked(readWingTrafficSource).mockResolvedValue(source(cancelled));
      return cancelled as never;
    });
    const view = renderControl();
    await waitFor(() => expect(screen.getByTestId('wing-traffic-collect')).toBeEnabled());
    fireEvent.click(screen.getByTestId('wing-traffic-collect'));
    await waitFor(() => expect(screen.getByTestId('wing-traffic-cancel')).toBeEnabled());

    fireEvent.click(screen.getByTestId('wing-traffic-cancel'));
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('사용자가 Wing 트래픽 수집을 중단했습니다.'));

    late.answer({ ok: false, message: '중단 뒤 도착한 실패' });
    // Give an unsuppressed handler time to refetch and announce the cancelled attempt.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(toast.error).not.toHaveBeenCalledWith('중단 뒤 도착한 실패');
    expect(toast.warning).not.toHaveBeenCalledWith('사용자가 Wing 트래픽 수집을 중단했습니다.');
    view.unmount();
  });

  it('still announces the late extension reply when a cancel fails', async () => {
    const late = deferredReply();
    vi.mocked(collectWingTrafficSource).mockImplementation(async () => unresponsiveOutcome(late.reply));
    vi.mocked(cancelWingTrafficSource).mockRejectedValue(new Error('중단 요청을 보내지 못했습니다.'));
    const view = renderControl();
    await waitFor(() => expect(screen.getByTestId('wing-traffic-collect')).toBeEnabled());
    fireEvent.click(screen.getByTestId('wing-traffic-collect'));
    await waitFor(() => expect(screen.getByTestId('wing-traffic-cancel')).toBeEnabled());

    fireEvent.click(screen.getByTestId('wing-traffic-cancel'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('중단 요청을 보내지 못했습니다.'));

    late.answer({ ok: false, message: 'Wing 로그인이 필요합니다.' });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Wing 로그인이 필요합니다.'));
    view.unmount();
  });
});
