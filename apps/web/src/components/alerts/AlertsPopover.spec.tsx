import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { AlertsPopover } from './AlertsPopover';

const fetchAlertsMock = vi.hoisted(() => vi.fn());
const postMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: fetchAlertsMock,
    getParsed: fetchAlertsMock,
    post: postMock,
  },
}));

function makeAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Sellpia 수집 실패',
    message: '공급가를 확인할 수 없습니다.',
    status: 'OPEN',
    isRead: false,
    href: '/stock-ops',
    createdAt: '2026-09-04T00:00:00.000Z',
    updatedAt: '2026-09-04T00:00:00.000Z',
    ...overrides,
  };
}

function renderAlerts() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AlertsPopover />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe('AlertsPopover', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    fetchAlertsMock.mockReset();
    postMock.mockReset();
    fetchAlertsMock.mockResolvedValue([makeAlert()]);
    postMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls durable alerts, refetches on focus, and dismisses through the Alert API', async () => {
    const { queryClient } = renderAlerts();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchAlertsMock).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(fetchAlertsMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchAlertsMock).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // Dismiss goes through the shared hook now, so the module export is no
    // longer the seam a mock can sit on. The POST is what "through the Alert
    // API" meant anyway.
    expect(postMock).toHaveBeenCalledWith(
      '/api/alerts/11111111-1111-4111-8111-111111111111/dismiss',
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.alerts.all });
  });

  it('does not run the polling interval while the document is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    renderAlerts();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchAlertsMock).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(fetchAlertsMock).toHaveBeenCalledTimes(1);
  });

  it('does not treat the retired lowercase status as an open alert', async () => {
    fetchAlertsMock.mockResolvedValue([makeAlert({ status: 'open' })]);
    renderAlerts();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.queryByText('해결됨')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '알림 닫기' })).toBeNull();
    expect(screen.queryByText('1')).toBeNull();
  });
});
