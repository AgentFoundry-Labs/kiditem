import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { queryKeys } from '@/lib/query-keys';
import { AlertItemSchema } from '@kiditem/shared/alerts';
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
    getParsed: vi.fn(),
    post: vi.fn(),
  },
}));

describe('alerts API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the organization-scoped durable alert list through the shared contract', async () => {
    const alerts = [{ id: 'alert-1', title: 'Sellpia 실패' }];
    vi.mocked(apiClient.getParsed).mockResolvedValue(alerts);

    await expect(fetchAlerts()).resolves.toEqual(alerts);
    // The endpoint had no executing assertion until it parsed; the shape is the
    // shared schema's now, not a hand-written interface's.
    expect(apiClient.getParsed).toHaveBeenCalledWith('/api/alerts', expect.anything());
  });

  it('dismisses one alert through the focused alert endpoint', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ ok: true });

    await expect(dismissAlert('alert/1')).resolves.toEqual({ ok: true });
    expect(apiClient.post).toHaveBeenCalledWith('/api/alerts/alert%2F1/dismiss');
  });

  it('실행 표에서 온 실패 알림도 같은 계약으로 읽고, 실행 id로 닫는다 — 정책 B(KID-355)', async () => {
    const operationId = '44444444-4444-4444-8444-444444444444';
    const item = {
      id: operationId,
      attemptId: operationId,
      status: 'OPEN',
      type: 'operation_failure',
      title: '셀피아 재고 수집 실패',
      message: '이 실행은 더 이상 유효하지 않습니다. 다시 시작해 주세요.',
      targetType: null,
      targetId: null,
      sourceType: 'products.sellpia_inventory',
      href: '/product-hub',
      isRead: false,
      createdAt: '2026-09-26T02:00:00.000Z',
      updatedAt: '2026-09-26T02:00:00.000Z',
    };
    expect(AlertItemSchema.parse(item)).toEqual(item);

    vi.mocked(apiClient.post).mockResolvedValue({ ok: true });
    await dismissAlert(item.id);
    expect(apiClient.post).toHaveBeenCalledWith(`/api/alerts/${operationId}/dismiss`);
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
