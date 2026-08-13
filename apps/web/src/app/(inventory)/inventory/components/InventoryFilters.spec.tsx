import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InventoryFilters } from './InventoryFilters';

describe('InventoryFilters', () => {
  it('renders one control group for each URL filter without a duplicate stock checkbox', () => {
    render(
      <InventoryFilters
        activeStatus="all"
        linkStatus="all"
        search=""
        stockStatus="in_stock"
        onActiveStatusChange={vi.fn()}
        onLinkStatusChange={vi.fn()}
        onSearchChange={vi.fn()}
        onSearchSubmit={vi.fn()}
        onStockStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('searchbox', { name: 'Sellpia 재고 검색' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '재고 상태' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '활성 상태' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '연결 상태' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '품절상품 포함' })).not.toBeInTheDocument();
  });

  it('reports the selected connection status', () => {
    const onLinkStatusChange = vi.fn();
    render(
      <InventoryFilters
        activeStatus="all"
        linkStatus="all"
        search=""
        stockStatus="in_stock"
        onActiveStatusChange={vi.fn()}
        onLinkStatusChange={onLinkStatusChange}
        onSearchChange={vi.fn()}
        onSearchSubmit={vi.fn()}
        onStockStatusChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '미연결' }));
    expect(onLinkStatusChange).toHaveBeenCalledWith('unlinked');
  });
});
