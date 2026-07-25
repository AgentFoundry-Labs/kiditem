import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  buildSalesChannelChartData,
  SalesChannelAnalysis,
} from './SalesChannelAnalysis';
import type { SellpiaSalesSummary } from '@kiditem/shared/dashboard';

vi.mock('next/dynamic', () => ({
  default: () => ({ data }: { data: unknown[] }) => (
    <div data-testid="sales-channel-chart">{data.length}일</div>
  ),
}));

const summary: SellpiaSalesSummary = {
  range: { from: '2026-07-01', to: '2026-07-25' },
  rocket: {
    revenue: 80_000,
    qty: 8,
    cost: 30_000,
    daily: [
      { date: '2026-07-02', revenue: 50_000, qty: 5 },
      { date: '2026-07-01', revenue: 30_000, qty: 3 },
    ],
    malls: [],
  },
  others: {
    revenue: 20_000,
    qty: 2,
    cost: 10_000,
    daily: [
      { date: '2026-07-01', revenue: 10_000, qty: 1 },
      { date: '2026-07-03', revenue: 10_000, qty: 1 },
    ],
    malls: [
      {
        sellerId: 'wing',
        sellerName: '쿠팡윙',
        revenue: 20_000,
        qty: 2,
        cost: 10_000,
        daily: [{ date: '2026-07-01', revenue: 20_000, qty: 2 }],
      },
    ],
  },
  totalRevenue: 100_000,
  totalCost: 40_000,
  adCost: 5_000,
  netProfit: 55_000,
  profitRate: 55,
  lastCapturedAt: '2026-07-25T00:00:00.000Z',
  hasData: true,
};

describe('SalesChannelAnalysis', () => {
  it('merges and sorts rocket and other-mall daily points', () => {
    expect(buildSalesChannelChartData(summary)).toEqual([
      { date: '2026-07-01', rocket: 30_000, others: 10_000 },
      { date: '2026-07-02', rocket: 50_000, others: 0 },
      { date: '2026-07-03', rocket: 0, others: 10_000 },
    ]);
  });

  it('shows the selected other-mall breakdown and changes channel on click', () => {
    const onChannelChange = vi.fn();
    render(
      <SalesChannelAnalysis
        summary={summary}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
        onSync={vi.fn()}
        syncing={false}
        selectedChannel="others"
        onChannelChange={onChannelChange}
        periodControl={<select aria-label="매출 기간"><option>2026년 7월</option></select>}
      />,
    );

    const periodControl = screen.getByLabelText('매출 기간');
    const syncButton = screen.getByRole('button', { name: '지금 수집' });
    expect(syncButton.parentElement).toContainElement(periodControl);
    expect(
      periodControl.compareDocumentPosition(syncButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText('쿠팡윙 · 기타몰 상세')).toBeInTheDocument();
    expect(screen.getByText('쿠팡윙')).toBeInTheDocument();
    expect(screen.getByTestId('sales-channel-chart')).toHaveTextContent('3일');

    fireEvent.click(screen.getByRole('button', { name: /쿠팡 로켓/ }));
    expect(onChannelChange).toHaveBeenCalledWith('rocket');
  });
});
