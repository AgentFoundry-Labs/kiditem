import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { queryKeys } from '@/lib/query-keys';
import {
  dismissAlert,
  fetchAlerts,
  needsAttention,
  unreadOpenAlertCount,
  useDismissAlert,
} from '../alerts-api';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('alerts API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the organization-scoped durable alert list', async () => {
    const alerts = [{ id: 'alert-1', title: 'Sellpia 실패' }];
    vi.mocked(apiClient.get).mockResolvedValue(alerts);

    await expect(fetchAlerts()).resolves.toEqual(alerts);
    expect(apiClient.get).toHaveBeenCalledWith('/api/alerts');
  });

  it('dismisses one alert through the focused alert endpoint', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ ok: true });

    await expect(dismissAlert('alert/1')).resolves.toEqual({ ok: true });
    expect(apiClient.post).toHaveBeenCalledWith('/api/alerts/alert%2F1/dismiss');
  });
});

describe('shared alert rules', () => {
  it('counts an alert as needing attention only when unread and open', () => {
    const alerts = [
      { isRead: false, status: 'OPEN' },
      { isRead: true, status: 'OPEN' },
      { isRead: false, status: 'RESOLVED' },
    ];

    // Three surfaces wrote this predicate independently, which is how two badges
    // came to show different numbers for the same state.
    expect(unreadOpenAlertCount(alerts)).toBe(1);
    expect(alerts.filter(needsAttention)).toEqual([{ isRead: false, status: 'OPEN' }]);
  });

  it('reconciles every surface showing an alert when one is dismissed', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    vi.mocked(apiClient.post).mockResolvedValue({ ok: true } as never);

    const { result } = renderHook(() => useDismissAlert(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
    await act(async () => {
      await result.current.mutateAsync('alert-1');
    });

    // The dashboard still receives its alerts inside the inventory payload, so
    // dismissing from either surface has to move both. The popover used to
    // invalidate only the first, leaving the dashboard's copy on screen.
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.alerts.all });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.all });
  });
});
