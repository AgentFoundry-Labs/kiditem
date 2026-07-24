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
            revenue: 10_000,
            netProfit: 3_000,
            profitRate: 30,
          },
        ] as never}
      />,
    );

    expect(screen.getByText('—')).toHaveClass('text-slate-400');
    expect(screen.queryByText('C')).not.toBeInTheDocument();
  });
});
