import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { InventorySkuSnapshotSummary } from '@kiditem/shared/inventory';
import { InventorySummaryCards } from './InventorySummaryCards';

const summary: InventorySkuSnapshotSummary = {
  totalSkus: 12,
  inStockSkus: 8,
  outOfStockSkus: 4,
  totalUnits: 25,
  pricedAssetValue: 123_000,
  unpricedSkuCount: 2,
};

describe('InventorySummaryCards', () => {
  it('renders inventory counts without stock-asset valuation', () => {
    render(<InventorySummaryCards summary={summary} />);

    expect(screen.getAllByTestId('inventory-summary-card')).toHaveLength(3);
    expect(screen.getByText('전체 재고 SKU')).toBeInTheDocument();
    expect(screen.getByText('재고 있는 SKU')).toBeInTheDocument();
    expect(screen.getByText('품절 SKU')).toBeInTheDocument();
    expect(screen.queryByText('평가 재고자산')).not.toBeInTheDocument();
  });

  it('uses theme-aware semantic colors for the slate summary card', () => {
    render(<InventorySummaryCards summary={summary} />);

    expect(screen.getByText('전체 재고 SKU').closest('[data-testid="inventory-summary-card"]')).toHaveClass(
      'border-[var(--border)]',
      'bg-[var(--surface)]',
    );
  });

  it('keeps all summary tone classes light-only', () => {
    const { container } = render(<InventorySummaryCards summary={summary} />);

    expect(container.querySelectorAll('[class*="dark:"]')).toHaveLength(0);
  });

  it('keeps returned summary values visible when import metadata is unavailable', () => {
    render(<InventorySummaryCards summary={summary} />);

    expect(screen.getByText('12개')).toBeInTheDocument();
    expect(screen.getByText('8개')).toBeInTheDocument();
    expect(screen.getByText('4개')).toBeInTheDocument();
  });
});
