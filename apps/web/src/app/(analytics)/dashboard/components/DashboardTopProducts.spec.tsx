import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardTopProducts } from './DashboardTopProducts';

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'listing-1',
    name: '미분류 상품',
    organization: '쿠팡',
    grade: null,
    abcEvaluation: null,
    revenue: 10_000,
    netProfit: 3_000,
    profitRate: 30,
    ...overrides,
  };
}

/** The row a product was rendered into, so a blank slot's dash is never mistaken
 *  for the product's own. */
function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest('tr') as HTMLElement;
}

describe('DashboardTopProducts', () => {
  it('renders an unclassified stored product grade neutrally', () => {
    render(<DashboardTopProducts products={[product()] as never} />);

    const cell = within(rowOf('미분류 상품')).getByTitle('미분류');
    expect(cell).toHaveTextContent('—');
    expect(screen.queryByTitle('C등급')).not.toBeInTheDocument();
  });

  it('renders a published grade as its own letter in the grade colour', () => {
    render(<DashboardTopProducts products={[product({ name: 'A급 상품', grade: 'A' })] as never} />);

    const cell = within(rowOf('A급 상품')).getByTitle('A등급');
    expect(cell).toHaveTextContent('A');
    expect(cell.className).toContain('text-primary');
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
        products={[product({
          id: 'line-sku:53889600',
          name: '로켓 공급 상품',
          organization: 'Coupang Rocket',
          revenue: 1_474_200,
          netProfit: null,
          profitRate: null,
        })] as never}
      />,
    );

    const row = within(rowOf('로켓 공급 상품'));
    expect(row.getByText('1,474,200')).toBeInTheDocument();
    // Grade, net profit, profit rate — three absent cells in this row alone.
    expect(row.getAllByText('—')).toHaveLength(3);
    expect(screen.queryByText('30%')).not.toBeInTheDocument();
    expect(screen.queryByText('442,260')).not.toBeInTheDocument();
  });

  /**
   * The panel is the same height on a day with no sales as on a day with six.
   * It used to swap one centred line for a table, so the panel and everything
   * under it moved the moment a collection landed.
   */
  it('holds six row slots whether or not there are six products', () => {
    const { container, rerender } = render(<DashboardTopProducts products={[] as never} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(6);
    expect(screen.queryByText(/표시할 상품 매출 데이터가 없습니다/)).not.toBeInTheDocument();

    rerender(<DashboardTopProducts products={[product({ name: '한 개뿐' })] as never} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(6);
    expect(screen.getByText('한 개뿐')).toBeInTheDocument();
  });

  it('never renders more rows than it has slots', () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      product({ id: `listing-${index}`, name: `상품 ${index}` }));
    const { container } = render(<DashboardTopProducts products={many as never} />);

    expect(container.querySelectorAll('tbody tr')).toHaveLength(6);
    expect(screen.getByText('상품 5')).toBeInTheDocument();
    expect(screen.queryByText('상품 6')).not.toBeInTheDocument();
  });
});
