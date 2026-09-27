import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FinanceWindowTotals } from '@kiditem/shared/finance';
import { AD_COST_TEXT_COLOR } from '@/lib/utils';
import ProfitLossSummaryCards from './ProfitLossSummaryCards';

const allocated: FinanceWindowTotals = {
  revenue: 20_000,
  orderCount: 1,
  cost: 3_001,
  adCost: 2_000,
  netProfit: 16_999,
  profitRate: 85,
  adCostRate: 10,
  unallocatedAdCost: 0,
  adAccountAdjustment: null,
  unmatchedAdCost: null,
  unallocatedShipping: 0,
};

/** KID-85 follow-up 3c — what the month total carries beyond its product rows. */
describe('ProfitLossSummaryCards parts no product row carries', () => {
  it('shows no leftover when the rows differ from the total only by rounding', () => {
    // A 1,001 KRW shipping price split over two rows rounds each to 501; the
    // server publishes that won as rounding, never as unallocated shipping.
    render(<ProfitLossSummaryCards totals={allocated} />);

    expect(screen.queryByText(/상품 행에 없는 금액/)).toBeNull();
    expect(screen.queryByText(/-1원/)).toBeNull();
  });

  it('names each part by its cause and names rounding', () => {
    render(
      <ProfitLossSummaryCards
        totals={{ ...allocated, unallocatedAdCost: 400, unallocatedShipping: 500 }}
      />,
    );

    expect(screen.getByText(
      '상품 행에 없는 금액 — 판매 없는 상품의 광고비(청구·VAT 포함) 400원 · 매출로 배분할 수 없는 배송비 500원. 상품 행은 각각 반올림해 합계와 몇 원 다를 수 있습니다.',
    )).toBeInTheDocument();
    expect(screen.queryByText(/캠페인 합계와 상품별 광고비 차이/)).toBeNull();
  });
});

describe('ProfitLossSummaryCards account adjustment', () => {
  it('shows the account adjustment as its own line of the ad cost it is part of', () => {
    render(<ProfitLossSummaryCards totals={{ ...allocated, adAccountAdjustment: 330 }} />);

    expect(screen.getByText('계정 조정 광고비 330원 포함')).toBeInTheDocument();
  });

  it('hides the line when the adjustment is unavailable or the server sends none', () => {
    const { unmount } = render(<ProfitLossSummaryCards totals={allocated} />);
    expect(screen.queryByText(/계정 조정 광고비/)).toBeNull();
    unmount();

    render(<ProfitLossSummaryCards totals={{ ...allocated, adAccountAdjustment: null }} />);
    expect(screen.queryByText(/계정 조정 광고비/)).toBeNull();
  });

  it('states the ad cost share of revenue in Korean', () => {
    render(<ProfitLossSummaryCards totals={allocated} />);

    expect(screen.getByText('매출 대비 10.0%')).toBeInTheDocument();
    expect(screen.queryByText(/ of /)).toBeNull();
  });
});

describe('ProfitLossSummaryCards ad spend tone', () => {
  it('shows the billed ad cost, VAT included, in the shared ad-cost tone, not the profit-filter orange', () => {
    render(<ProfitLossSummaryCards totals={allocated} />);

    const value = screen.getByText('광고비(청구·VAT 포함)').nextElementSibling;
    expect(value).toHaveClass(AD_COST_TEXT_COLOR);
    expect(value).not.toHaveClass('text-orange-600');
  });
});
