import { QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissAlert } from '@/lib/alerts-api';
import { queryKeys } from '@/lib/query-keys';
import { DashboardSidePanel } from './DashboardSidePanel';
import type { DashboardAlertItem } from '@kiditem/shared/dashboard';

const mockDismissAlert = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));

vi.mock('@/lib/alerts-api', () => ({
  // Which queries a dismiss invalidates is the hook's answer; it is asserted
  // where the hook lives. This panel's job is to ask.
  useDismissAlert: () => ({ mutate: mockDismissAlert }),
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
  status: 'OPEN',
  type: 'stock_low',
  severity: 'warning',
  title: '재고 부족',
  message: '재고를 확인하세요',
  sourceType: 'inventory',
  href: null,
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
      />,
    );

    expect(screen.getByText('재고 부족')).toBeInTheDocument();
    expect(screen.getByText('재고를 확인하세요')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('확인 필요')).toBeInTheDocument();
  });

  it('asks to dismiss the open alert it was clicked on', async () => {
    render(<DashboardSidePanel alerts={[makeAlert()]} />);

    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));

    await waitFor(() => {
      expect(mockDismissAlert).toHaveBeenCalledWith('alert-1');
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
      />,
    );

    expect(screen.getByText('해결됨')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '알림 닫기' })).not.toBeInTheDocument();
  });

  it('renders an empty state when no alerts are available', () => {
    render(<DashboardSidePanel alerts={[]} />);

    expect(screen.getByText('표시할 알림이 없습니다')).toBeInTheDocument();
  });
});
