import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { AlertsPopover } from './AlertsPopover';

const fetchAlertsMock = vi.hoisted(() => vi.fn());
const dismissAlertMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: fetchAlertsMock,
    post: vi.fn(),
  },
}));

vi.mock('@/lib/alerts-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/alerts-api')>('@/lib/alerts-api');
  return {
    ...actual,
    dismissAlert: dismissAlertMock,
  };
});

function makeAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Sellpia 수집 실패',
    message: '공급가를 확인할 수 없습니다.',
    status: 'OPEN',
    severity: 'error',
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
    dismissAlertMock.mockReset();
    fetchAlertsMock.mockResolvedValue([makeAlert()]);
    dismissAlertMock.mockResolvedValue({ ok: true });
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
    expect(dismissAlertMock).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ client: queryClient }),
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
});
