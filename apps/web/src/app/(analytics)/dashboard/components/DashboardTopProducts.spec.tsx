import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardTopProducts } from './DashboardTopProducts';

describe('DashboardTopProducts', () => {
  it('renders an unclassified stored product grade neutrally', () => {
    render(
      <DashboardTopProducts
        products={[
          {
            id: 'listing-1',
            name: '미분류 상품',
            organization: '쿠팡',
            grade: null,
            abcEvaluation: null,
            revenue: 10_000,
            netProfit: 3_000,
            profitRate: 30,
          },
        ] as never}
      />,
    );

    expect(screen.getByText('미분류')).toBeInTheDocument();
    expect(screen.queryByText('C')).not.toBeInTheDocument();
  });

  /**
   * Revenue is always measured; profit is not. A Rocket purchase-order line has
   * no listing to settle against, so the backend publishes no profit for it.
   * The row still belongs in the ranking — it is channel revenue — and the two
   * profit cells read as absent rather than as a figure.
   */
  it('shows the ranked revenue and an absent profit when the backend withheld it', () => {
    render(
      <DashboardTopProducts
        products={[
          {
            id: 'line-sku:53889600',
            name: '로켓 공급 상품',
            organization: 'Coupang Rocket',
            grade: null,
            abcEvaluation: null,
            revenue: 1_474_200,
            netProfit: null,
            profitRate: null,
          },
        ] as never}
      />,
    );

    expect(screen.getByText('로켓 공급 상품')).toBeInTheDocument();
    expect(screen.getByText('1,474,200')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.queryByText('30%')).not.toBeInTheDocument();
    expect(screen.queryByText('442,260')).not.toBeInTheDocument();
  });
});
