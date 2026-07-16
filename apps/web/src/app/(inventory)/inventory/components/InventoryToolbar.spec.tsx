import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InventoryToolbar } from './InventoryToolbar';

describe('InventoryToolbar', () => {
  it('uses the develop toolbar hierarchy without stock mutation controls', () => {
    render(
      <InventoryToolbar
        query=""
        latestImportAt={null}
        busy={false}
        onQueryChange={vi.fn()}
        onSearch={vi.fn()}
        onBarcodePrint={vi.fn()}
        onExcel={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '재고/발주 관리' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '바코드 출력' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '엑셀' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /입고|출고|조정/ })).not.toBeInTheDocument();
  });
});
