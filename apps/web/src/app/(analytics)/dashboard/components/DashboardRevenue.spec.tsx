import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DashboardRevenue } from './DashboardRevenue';
import type { SellpiaSalesSummary } from '@kiditem/shared/dashboard';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => children,
  ComposedChart: ({ data }: { data: unknown }) => <pre data-testid="revenue-plot">{JSON.stringify(data)}</pre>,
  Bar: () => null,
  CartesianGrid: () => null,
  Line: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const summary: SellpiaSalesSummary = {
  knownThrough: '2026-09-05',
  range: { from: '2026-09-01', to: '2026-09-05' },
  rocket: {
    revenue: 10, cost: 0, qty: 1, revenueShare: 100, malls: [],
    daily: [
      { date: '2026-09-02', revenue: 10, qty: 1, revenueShare: 100 },
      { date: '2026-09-04', revenue: 0, qty: 0, revenueShare: 0 },
    ],
  },
  others: { revenue: 0, cost: 0, qty: 0, revenueShare: 0, malls: [], daily: [] },
  totalRevenue: 10, totalCost: 0, adCost: null, netProfit: null, profitRate: null,
  lastCapturedAt: null, hasData: true,
};

function plottedPoints() {
  return JSON.parse(screen.getByTestId('revenue-plot').textContent!);
}

beforeEach(() => localStorage.clear());

describe('Dashboard revenue measured dates', () => {
  it('keeps the whole selected axis, blanks missing dates, and preserves measured zero', () => {
    render(<DashboardRevenue summary={summary} isLoading={false} isError={false} salesHref="/sales-analysis" />);
    expect(plottedPoints()).toEqual([
      { date: '2026-09-01' },
      { date: '2026-09-02', rocket: 10 },
      { date: '2026-09-03' },
      { date: '2026-09-04', rocket: 0 },
      { date: '2026-09-05' },
    ]);
    expect(screen.getByText('로켓 외 쇼핑몰')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    fireEvent.click(screen.getByRole('radio', { name: '누적' }));
    expect(plottedPoints()).toEqual([
      { date: '2026-09-01' },
      { date: '2026-09-02', rocket: 10 },
      { date: '2026-09-03' },
      { date: '2026-09-04', rocket: 10 },
      { date: '2026-09-05' },
    ]);
  });
});
