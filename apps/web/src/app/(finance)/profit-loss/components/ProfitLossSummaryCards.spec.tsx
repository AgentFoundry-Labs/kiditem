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
  adCostGrainDifference: 0,
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

  it('names each part by its cause, keeps the grain difference signed, and names rounding', () => {
    render(
      <ProfitLossSummaryCards
        totals={{ ...allocated, unallocatedAdCost: 400, adCostGrainDifference: -200, unallocatedShipping: 500 }}
      />,
    );

    expect(screen.getByText(
      '상품 행에 없는 금액 — 판매 없는 상품의 광고비 400원 · 캠페인 합계와 상품별 광고비 차이 -200원 · 매출로 배분할 수 없는 배송비 500원. 상품 행은 각각 반올림해 합계와 몇 원 다를 수 있습니다.',
    )).toBeInTheDocument();
  });

  it('lists only the parts that exist, with a positive grain difference marked', () => {
    render(<ProfitLossSummaryCards totals={{ ...allocated, adCostGrainDifference: 200 }} />);

    expect(screen.getByText(
      '상품 행에 없는 금액 — 캠페인 합계와 상품별 광고비 차이 +200원. 상품 행은 각각 반올림해 합계와 몇 원 다를 수 있습니다.',
    )).toBeInTheDocument();
  });
});

describe('ProfitLossSummaryCards ad spend tone', () => {
  it('shows the total ad spend in the shared ad-cost tone, not the profit-filter orange', () => {
    render(<ProfitLossSummaryCards totals={allocated} />);

    const value = screen.getByText('총 광고비').nextElementSibling;
    expect(value).toHaveClass(AD_COST_TEXT_COLOR);
    expect(value).not.toHaveClass('text-orange-600');
  });
});
