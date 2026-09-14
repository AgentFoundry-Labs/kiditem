import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardTopProducts } from './components/DashboardTopProducts';
import { DashboardTrafficFunnel } from './components/DashboardTrafficFunnel';

/**
 * A dashboard an operator opens every morning should put each number in the
 * same place. These panels used to swap one layout for another the moment data
 * arrived — the funnel dropped its five slots entirely when nothing was
 * collected, and Top 상품 traded a centred sentence for a table — so landing a
 * collection moved the panel and everything under it.
 *
 * The difference between an empty day and a full one belongs in the values.
 * Counting the slots is how that is checked without a layout engine: a slot
 * count that does not move is a height that does not move, given the rows are
 * the same shape either way.
 */
const STEPS = [
  { key: 'visitors', label: '일평균 방문자', display: '185.1명', rate: null, basis: null, rateBasis: null },
  { key: 'views', label: '조회', display: '2,325회', rate: null, basis: null, rateBasis: null },
  { key: 'cartAdds', label: '장바구니', display: '261회', rate: '11.2%', basis: null, rateBasis: null },
  { key: 'orders', label: '주문', display: '92건', rate: '35.2%', basis: null, rateBasis: null },
  { key: 'salesQty', label: '판매량', display: '537개', rate: null, basis: null, rateBasis: null },
];

function funnel(collected: boolean) {
  return (
    <DashboardTrafficFunnel
      steps={STEPS}
      partial={collected}
      sourceNote="2026. 09. 12. · 부분 10/11일"
      collected={collected}
      onCollect={() => {}}
    />
  );
}

describe('dashboard panels keep their shape when data arrives', () => {
  it('the Wing traffic funnel holds five slots collected or not', () => {
    const { container, rerender } = render(funnel(false));
    expect(container.querySelectorAll('ol li')).toHaveLength(5);
    expect(screen.getByText('일평균 방문자').parentElement).toHaveTextContent('일평균 방문자—');

    rerender(funnel(true));
    expect(container.querySelectorAll('ol li')).toHaveLength(5);
    expect(screen.getByText('일평균 방문자').parentElement).toHaveTextContent('일평균 방문자185.1명');
  });

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
