import { QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissAlert } from '@/lib/alerts-api';
import { queryKeys } from '@/lib/query-keys';
import { DashboardSidePanel } from './DashboardSidePanel';
import type { DashboardAlertItem } from '@kiditem/shared/dashboard';

const mockDismissAlert = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));

vi.mock('@/lib/alerts-api', () => ({
  dismissAlert: mockDismissAlert,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const makeAlert = (
  overrides: Partial<DashboardAlertItem> = {},
): DashboardAlertItem => ({
  id: 'alert-1',
  kind: 'signal',
  status: 'OPEN',
  type: 'stock_low',
  severity: 'warning',
  title: '재고 부족',
  message: '재고를 확인하세요',
  operationKey: null,
  sourceType: 'inventory',
  href: null,
  progress: null,
  targetType: null,
  targetId: null,
  isRead: false,
  createdAt: '2026-05-17T00:00:00.000Z',
  updatedAt: '2026-05-17T00:00:00.000Z',
  ...overrides,
});

describe('DashboardSidePanel', () => {
  beforeEach(() => {
    mockDismissAlert.mockClear();
  });

  it('renders the supplied alerts and unread count', () => {
    render(
      <DashboardSidePanel
        alerts={[makeAlert()]}
        queryClient={makeQueryClient()}
      />,
    );

    expect(screen.getByText('재고 부족')).toBeInTheDocument();
    expect(screen.getByText('재고를 확인하세요')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('확인 필요')).toBeInTheDocument();
  });

  it('dismisses an open alert and invalidates alert and dashboard queries', async () => {
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    render(<DashboardSidePanel alerts={[makeAlert()]} queryClient={queryClient} />);

    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));

    await waitFor(() => {
      expect(mockDismissAlert).toHaveBeenCalledWith('alert-1');
    });
    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.alerts.all,
      });
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.dashboard.all,
      });
    });
  });

  it('does not offer dismiss for resolved alerts', () => {
    render(
      <DashboardSidePanel
        alerts={[
          makeAlert({
            status: 'RESOLVED',
            isRead: true,
          }),
        ]}
        queryClient={makeQueryClient()}
      />,
    );

    expect(screen.getByText('해결됨')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '알림 닫기' })).not.toBeInTheDocument();
  });

  it('routes stock-low alerts to the canonical inventory workspace', () => {
    render(
      <DashboardSidePanel
        alerts={[makeAlert({ type: 'stock_low' })]}
        queryClient={makeQueryClient()}
      />,
    );

    expect(screen.getByRole('link')).toHaveAttribute('href', '/inventory-hub');
  });

  it('renders an empty state when no alerts are available', () => {
    render(<DashboardSidePanel alerts={[]} queryClient={makeQueryClient()} />);

    expect(screen.getByText('표시할 알림이 없습니다')).toBeInTheDocument();
  });
});
