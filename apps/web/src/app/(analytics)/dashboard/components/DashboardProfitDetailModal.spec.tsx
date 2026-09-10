import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardProfitDetailModal } from './DashboardProfitDetailModal';
import type { DashboardAdSummary, DashboardSalesSummary } from '@kiditem/shared/dashboard';

function salesBaseline(monthly: Partial<DashboardSalesSummary['monthly']> = {}): DashboardSalesSummary {
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
  };
}

function adBaseline(monthly: Partial<DashboardAdSummary['monthly']> = {}): DashboardAdSummary {
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
  };
}

function renderModal(
  sales: DashboardSalesSummary,
  ad: DashboardAdSummary,
) {
  return render(
    <DashboardProfitDetailModal
      salesBaseline={sales}
      adBaseline={ad}
      onClose={() => undefined}
    />,
  );
}

describe('DashboardProfitDetailModal', () => {
  it('renders unavailable nullable ad and profit values as dashes', () => {
    renderModal(salesBaseline(), adBaseline());

    expect(screen.getByText('광고비').parentElement).toHaveTextContent('—');
    expect(screen.getByText('광고전환매출').parentElement).toHaveTextContent('—');
    expect(screen.getByText('순이익').parentElement).toHaveTextContent('—');
    expect(screen.getByText('ROAS —% | CTR —%')).toBeInTheDocument();
  });

  it('preserves explicit zero ad and profit values', () => {
    renderModal(
      salesBaseline({ revenue: 0, profit: 0 }),
      adBaseline({ roas: 0, ctr: 0, adRevenue: 0, totalAdSpend: 0 }),
    );

    expect(screen.getByText('광고비').parentElement).toHaveTextContent('0원');
    expect(screen.getByText('광고전환매출').parentElement).toHaveTextContent('0원');
    expect(screen.getByText('순이익').parentElement).toHaveTextContent('0원');
    expect(screen.getByText('ROAS 0% | CTR 0.00%')).toBeInTheDocument();
  });
});
