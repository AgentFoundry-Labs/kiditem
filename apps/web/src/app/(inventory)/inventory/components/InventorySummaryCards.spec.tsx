import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { InventorySkuSnapshotSummary } from '@kiditem/shared/inventory';
import { InventoryFilterTabs } from './InventoryFilterTabs';
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
  it('renders four develop-style inventory summary cards with current snapshot semantics', () => {
    render(<InventorySummaryCards summary={summary} />);

    expect(screen.getAllByTestId('inventory-summary-card')).toHaveLength(4);
    expect(screen.getByText('전체 상품')).toBeInTheDocument();
    expect(screen.getByText('재고 있음')).toBeInTheDocument();
    expect(screen.getByText('재고 없음')).toBeInTheDocument();
    expect(screen.getByText('평가 재고자산')).toBeInTheDocument();
  });

  it('uses theme-aware semantic colors for the slate summary card', () => {
    render(<InventorySummaryCards summary={summary} />);

    expect(screen.getByText('전체 상품').closest('[data-testid="inventory-summary-card"]')).toHaveClass(
      'border-[var(--border)]',
      'bg-[var(--surface)]',
    );
  });

  it('keeps all summary tone classes light-only', () => {
    const { container } = render(<InventorySummaryCards summary={summary} />);

    expect(container.querySelectorAll('[class*="dark:"]')).toHaveLength(0);
  });
});

describe('InventoryFilterTabs', () => {
  it('renders develop-style rectangular status filters', () => {
    render(
      <InventoryFilterTabs
        filter="in_stock"
        summary={summary}
        onFilterChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '재고 있음 (8)' })).toHaveClass('bg-purple-600');
    expect(screen.getByRole('button', { name: '재고 없음 (4)' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('keeps the same border width across active and inactive filters', () => {
    render(
      <InventoryFilterTabs
        filter="in_stock"
        summary={summary}
        onFilterChange={vi.fn()}
      />,
    );

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveClass('border');
    }
  });

  it('keeps inactive filter hover styling light-only', () => {
    render(
      <InventoryFilterTabs
        filter="in_stock"
        summary={summary}
        onFilterChange={vi.fn()}
      />,
    );

    const inactive = screen.getByRole('button', { name: '재고 없음 (4)' });
    expect(inactive).toHaveClass('hover:bg-slate-50');
    expect(inactive).not.toHaveClass('hover:bg-muted');
  });
});
