import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useSellpiaInventoryFreshness', () => ({
  useSellpiaInventoryFreshness: () => ({
    requestRefresh: vi.fn(),
    state: {
      status: 'fresh',
      lastVerifiedAt: '2026-07-30T06:03:27.000Z',
      unresolvedOrderTransmissionIntents: [],
    },
  }),
}));

import { InventoryToolbar } from './InventoryToolbar';

describe('InventoryToolbar', () => {
  it('uses the develop toolbar hierarchy without stock mutation controls', () => {
    const onIncludeOutOfStockChange = vi.fn();
    render(
      <InventoryToolbar
        query=""
        includeOutOfStock={false}
        latestImportAt={null}
        busy={false}
        onQueryChange={vi.fn()}
        onIncludeOutOfStockChange={onIncludeOutOfStockChange}
        onSearch={vi.fn()}
        onBarcodePrint={vi.fn()}
        onExcel={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '재고 현황' })).toBeInTheDocument();
    expect(screen.queryByText('재고/발주 관리')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '셀피아 재고 동기화' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '바코드 출력' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '엑셀' })).toBeInTheDocument();
    const includeOutOfStock = screen.getByRole('checkbox', { name: '품절상품 포함' });
    expect(includeOutOfStock).not.toBeChecked();
    fireEvent.click(includeOutOfStock);
    expect(onIncludeOutOfStockChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('button', { name: /입고|출고|조정/ })).not.toBeInTheDocument();
  });
});
