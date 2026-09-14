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
  knownThrough: '2026-07-25',
  range: { from: '2026-07-01', to: '2026-07-25' },
  rocket: {
    revenue: 80_000,
    qty: 8,
    cost: 30_000,
    revenueShare: 80,
    daily: [
      { date: '2026-07-02', revenue: 50_000, qty: 5, revenueShare: 63 },
      { date: '2026-07-01', revenue: 30_000, qty: 3, revenueShare: 38 },
    ],
    malls: [],
  },
  others: {
    revenue: 20_000,
    qty: 2,
    cost: 10_000,
    revenueShare: 20,
    daily: [
      { date: '2026-07-01', revenue: 10_000, qty: 1, revenueShare: 50 },
      { date: '2026-07-03', revenue: 10_000, qty: 1, revenueShare: 50 },
    ],
    malls: [
      {
        sellerId: 'wing',
        sellerName: '쿠팡윙',
        revenue: 20_000,
        qty: 2,
        cost: 10_000,
        revenueShare: 100,
        daily: [{ date: '2026-07-01', revenue: 20_000, qty: 2, revenueShare: 100 }],
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
  const renderSummary = (
    value: SellpiaSalesSummary,
    selectedChannel: 'all' | 'rocket' | 'others',
  ) => render(
    <SalesChannelAnalysis
      summary={value}
      isLoading={false}
      isError={false}
      onRetry={vi.fn()}
      selectedChannel={selectedChannel}
      onChannelChange={vi.fn()}
    />,
  );

  it("renders the server's revenue shares rather than recomputing them", () => {
    renderSummary({
      ...summary,
      rocket: { ...summary.rocket, revenueShare: 79 },
      others: {
        ...summary.others,
        revenueShare: 21,
        malls: [{ ...summary.others.malls[0]!, revenueShare: 99 }],
      },
    }, 'others');

    // 80,000 / 100,000 would be 80%: the card shows the server's share.
    expect(screen.getByText('79%')).toBeInTheDocument();
    expect(screen.queryByText('80%')).toBeNull();
    expect(screen.getByText('21%')).toBeInTheDocument();
    expect(screen.getByText('99%')).toBeInTheDocument();
  });

  it('shows - for a share over a zero denominator, never 0%', () => {
    renderSummary({
      ...summary,
      totalRevenue: 0,
      rocket: {
        ...summary.rocket,
        revenue: 0,
        revenueShare: null,
        daily: [{ date: '2026-07-01', revenue: 0, qty: 0, revenueShare: null }],
      },
      others: { ...summary.others, revenue: 0, revenueShare: null, daily: [], malls: [] },
    }, 'rocket');

    expect(screen.queryByText('0%')).toBeNull();
    // Both channel cards and the one Rocket day.
    expect(screen.getAllByText('-')).toHaveLength(3);
  });

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
        collectionControl={<button type="button">지금 수집</button>}
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
  it('offers the shared collection control again when the period has no collected sales', () => {
    render(
      <SalesChannelAnalysis
        summary={{ ...summary, hasData: false }}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
        selectedChannel="all"
        onChannelChange={vi.fn()}
        collectionControl={<button type="button">지금 수집</button>}
      />,
    );

    expect(screen.getByText('선택한 기간에 수집된 몰별 매출이 없습니다.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '지금 수집' })).toHaveLength(2);
  });
});
