import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  DashboardProfitDetailModal,
  type DashboardProfitDetailRange,
} from './DashboardProfitDetailModal';
import type {
  DashboardAdSummary,
  DashboardMetricBasis,
  DashboardSalesSummary,
} from '@kiditem/shared/dashboard';

function periodBasis(
  overrides: Partial<Extract<DashboardMetricBasis, { kind: 'period' }>> = {},
): DashboardMetricBasis {
  return {
    kind: 'period',
    from: '2026-09-01',
    to: '2026-09-02',
    targetDays: 2,
    includedDates: ['2026-09-01', '2026-09-02'],
    includedDays: 2,
    missingDates: [],
    invalidDates: [],
    sources: ['orders'],
    status: 'complete',
    partial: false,
    observedAt: null,
    ...overrides,
  } as DashboardMetricBasis;
}

function salesBaseline(
  overrides: Partial<DashboardSalesSummary> = {},
  monthly: Partial<DashboardSalesSummary['monthly']> = {},
): DashboardSalesSummary {
  return {
    today: { revenue: 0, orders: 0 },
    monthly: {
      revenue: null,
      wingRevenue: null,
      profit: null,
      adRate: null,
      prevRevenue: null,
      prevProfit: null,
      revenueChange: null,
      profitChange: null,
      prevAdRate: null,
      available: false,
      previousAvailable: false,
      ...monthly,
    },
    topProducts: [],
    monthlyTrend: [],
    ...overrides,
  } as DashboardSalesSummary;
}

function adBaseline(
  monthly: Partial<DashboardAdSummary['monthly']> = {},
  overrides: Partial<DashboardAdSummary> = {},
): DashboardAdSummary {
  return {
    monthly: {
      roas: null,
      ctr: null,
      adRevenue: null,
      totalAdSpend: null,
      prevRoas: null,
      prevCtr: null,
      prevAdRevenue: null,
      prevTotalAdSpend: null,
      ...monthly,
    },
    ...overrides,
  } as DashboardAdSummary;
}

function renderModal(
  sales: DashboardSalesSummary,
  ad: DashboardAdSummary,
  selectedRange: DashboardProfitDetailRange = 'month',
) {
  return render(
    <DashboardProfitDetailModal
      salesBaseline={sales}
      adBaseline={ad}
      selectedRange={selectedRange}
      onClose={() => undefined}
    />,
  );
}

describe('DashboardProfitDetailModal', () => {
  it('renders unavailable nullable ad and profit values as dashes', () => {
    renderModal(salesBaseline(), adBaseline());

    expect(screen.getByText('집행광고비').parentElement).toHaveTextContent('—');
    expect(screen.getByText('광고전환매출').parentElement).toHaveTextContent('—');
    expect(screen.getByText('순이익').parentElement).toHaveTextContent('—');
    expect(screen.getByText('ROAS —% | CTR —%')).toBeInTheDocument();
  });

  it('preserves explicit zero ad and profit values', () => {
    renderModal(
      salesBaseline({
        rangeKpi: {
          range: 'month',
          revenue: 0,
          profit: 0,
          prevRevenue: 0,
          prevProfit: 0,
          revenueChange: 0,
          profitChange: 0,
        },
      } as Partial<DashboardSalesSummary>),
      adBaseline({ roas: 0, ctr: 0, adRevenue: 0, totalAdSpend: 0 }),
    );

    expect(screen.getByText('집행광고비').parentElement).toHaveTextContent('0원');
    expect(screen.getByText('광고전환매출').parentElement).toHaveTextContent('0원');
    expect(screen.getByText('순이익').parentElement).toHaveTextContent('0원');
    expect(screen.getByText('ROAS 0% | CTR 0.00%')).toBeInTheDocument();
  });

  it('does not substitute the baseline month when the selected range has no profit', () => {
    renderModal(
      salesBaseline({}, { revenue: 5_000_000, profit: 1_200_000, available: true }),
      adBaseline(),
    );

    expect(screen.getByText('순이익').parentElement).toHaveTextContent('—');
    expect(screen.queryByText(/1,200,000/)).toBeNull();
    expect(screen.queryByText(/5,000,000/)).toBeNull();
  });

  it('does not pair advertising rows with a sales revenue from another source', () => {
    renderModal(
      salesBaseline({
        rangeKpi: {
          range: 'month',
          revenue: 5_000_000,
          profit: null,
          prevRevenue: null,
          prevProfit: null,
          revenueChange: null,
          profitChange: null,
        },
      } as Partial<DashboardSalesSummary>),
      adBaseline({ totalAdSpend: 300_000, adRevenue: 900_000 }),
    );

    expect(screen.queryByText('매출')).toBeNull();
    expect(screen.queryByText(/5,000,000/)).toBeNull();
    expect(screen.getByTestId('dashboard-profit-detail-scope')).toHaveTextContent('광고 지표만 표시');
    expect(screen.getByText('집행광고비').parentElement).toHaveTextContent('-300,000원');
    expect(screen.getByText('광고전환매출').parentElement).toHaveTextContent('900,000원');
  });

  it('labels advertising-only rows with the advertising basis, not the sales basis', async () => {
    renderModal(
      salesBaseline({
        metricBasis: { 'rangeKpi.profit': periodBasis({ sources: ['orders'] }) },
      } as Partial<DashboardSalesSummary>),
      adBaseline(
        { totalAdSpend: 300_000, adRevenue: 900_000 },
        {
          metricBasis: {
            'monthly.totalAdSpend': periodBasis({ sources: ['coupang_ads'], from: '2026-09-01', to: '2026-09-01', targetDays: 1, includedDates: ['2026-09-01'], includedDays: 1 }),
          },
        } as Partial<DashboardAdSummary>,
      ),
    );

    // One affordance for the modal, but never one claim for both values: the
    // rows' own basis and the net-profit basis stay separate rows naming
    // separate sources.
    fireEvent.click(screen.getByRole('button', { name: '순이익 구조 근거 안내' }));

    const note = await screen.findByRole('note');
    expect(within(note).getByRole('row', { name: /비용 구성/ })).toHaveTextContent('coupang_ads');
    expect(within(note).getByRole('row', { name: /비용 구성/ })).not.toHaveTextContent('orders');
    expect(within(note).getByRole('row', { name: /순이익/ })).toHaveTextContent('orders');
  });

  it('shows the profit inputs basis for the rows it actually renders', async () => {
    renderModal(
      salesBaseline({
        profitInputs: {
          revenue: 1_000_000,
          cost: 400_000,
          adCost: 100_000,
          qty: 10,
          basis: periodBasis({ sources: ['sellpia_sales'] }),
        },
      } as Partial<DashboardSalesSummary>),
      adBaseline(),
    );

    fireEvent.click(screen.getByRole('button', { name: '순이익 구조 근거 안내' }));

    const note = await screen.findByRole('note');
    expect(within(note).getByRole('row', { name: /비용 구성/ })).toHaveTextContent('sellpia_sales');
    expect(screen.getByText('매출').parentElement).toHaveTextContent('1,000,000원');
  });

  it('renders no basis at all rather than a basis describing another period', () => {
    renderModal(
      salesBaseline({
        profitDetail: {
          revenue: 1_000_000,
          costOfGoods: 400_000,
          commission: 100_000,
          shippingCost: 50_000,
          adCost: 100_000,
          otherCost: 0,
          netProfit: 350_000,
          orderCount: 12,
        },
        metricBasis: { 'monthly.profit': periodBasis({ sources: ['orders'] }) },
      } as Partial<DashboardSalesSummary>),
      adBaseline(),
    );

    expect(screen.getByText('순이익').parentElement).toHaveTextContent('350,000원');
    expect(screen.queryAllByTestId('dashboard-data-basis')).toHaveLength(0);
  });

  it.each<DashboardProfitDetailRange>(['week', 'day', 'custom'])(
    'does not present the month profit structure as the selected %s range',
    (selectedRange) => {
      renderModal(
        salesBaseline({
          // Server-built for the calendar month, never for the selection.
          profitDetail: {
            revenue: 5_000_000,
            costOfGoods: 2_000_000,
            commission: 500_000,
            shippingCost: 250_000,
            adCost: 400_000,
            otherCost: 0,
            netProfit: 1_850_000,
            orderCount: 120,
          },
          rangeKpi: {
            range: selectedRange,
            revenue: 700_000,
            profit: 210_000,
            prevRevenue: null,
            prevProfit: null,
            revenueChange: null,
            profitChange: null,
          },
        } as Partial<DashboardSalesSummary>),
        adBaseline(),
        selectedRange,
      );

      expect(screen.queryByText('수수료')).toBeNull();
      expect(screen.queryByText('매입원가')).toBeNull();
      for (const monthValue of ['5,000,000', '2,000,000', '500,000', '250,000', '400,000', '1,850,000']) {
        expect(screen.queryByText(new RegExp(monthValue))).toBeNull();
      }
      expect(screen.queryByText(/주문 120건 기준/)).toBeNull();
      expect(screen.getByText('순이익').parentElement).toHaveTextContent('210,000원');
      expect(screen.getByTestId('dashboard-profit-detail-scope')).toHaveTextContent('이번 달 광고 지표만 표시');
    },
  );

  it('keeps the month profit structure for a month selection', () => {
    renderModal(
      salesBaseline({
        profitDetail: {
          revenue: 5_000_000,
          costOfGoods: 2_000_000,
          commission: 500_000,
          shippingCost: 250_000,
          adCost: 400_000,
          otherCost: 0,
          netProfit: 1_850_000,
          orderCount: 120,
        },
        rangeKpi: {
          range: 'month',
          revenue: 5_000_000,
          profit: 1_850_000,
          prevRevenue: null,
          prevProfit: null,
          revenueChange: null,
          profitChange: null,
        },
        metricBasis: { 'rangeKpi.profit': periodBasis({ sources: ['orders'] }) },
      } as Partial<DashboardSalesSummary>),
      adBaseline(),
      'month',
    );

    expect(screen.getByText('수수료').parentElement).toHaveTextContent('-500,000원');
    expect(screen.getByText('순이익').parentElement).toHaveTextContent('1,850,000원');
    expect(screen.getByText('주문 120건 기준')).toBeInTheDocument();
    // The rows are the selected range's own profit structure, so its basis is
    // labelled once instead of twice.
    expect(screen.getAllByTestId('dashboard-data-basis')).toHaveLength(1);
  });
});
