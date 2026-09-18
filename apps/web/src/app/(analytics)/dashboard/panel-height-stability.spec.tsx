import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardTopProducts } from './components/DashboardTopProducts';

/**
 * A dashboard an operator opens every morning should put each number in the
 * same place. These panels used to swap one layout for another the moment data
 * arrived — the funnel dropped its five slots entirely when nothing was
 * collected, and Top 상품 traded a centred sentence for a table — so landing a
 * collection moved the panel and everything under it. (The funnel left the
 * dashboard in the 2026-09-18 simplification; Top 상품 keeps the rule.)
 *
 * The difference between an empty day and a full one belongs in the values.
 * Counting the slots is how that is checked without a layout engine: a slot
 * count that does not move is a height that does not move, given the rows are
 * the same shape either way.
 */
describe('dashboard panels keep their shape when data arrives', () => {
  it('Top 상품 holds six rows empty or full', () => {
    const product = (index: number) => ({
      id: `listing-${index}`,
      name: `상품 ${index}`,
      organization: '쿠팡',
      grade: null,
      abcEvaluation: null,
      revenue: 1_000,
      netProfit: 100,
      profitRate: 10,
    });

    const { container, rerender } = render(<DashboardTopProducts products={[] as never} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(6);

    rerender(<DashboardTopProducts products={[0, 1, 2].map(product) as never} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(6);

    rerender(<DashboardTopProducts products={[0, 1, 2, 3, 4, 5, 6, 7].map(product) as never} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(6);
  });

  it('every panel row keeps its cell count, so a dash and a value occupy one slot', () => {
    const { container } = render(<DashboardTopProducts products={[] as never} />);
    const cellCounts = [...container.querySelectorAll('tbody tr')]
      .map(row => row.querySelectorAll('td').length);
    expect(new Set(cellCounts).size).toBe(1);
    expect(cellCounts[0]).toBe(container.querySelectorAll('thead th').length);
  });
});
