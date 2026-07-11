import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InventoryTable } from './InventoryTable';

describe('InventoryTable', () => {
  it('shows Sellpia snapshot columns and no stock mutation actions', () => {
    render(<InventoryTable
      items={[{
        id: '00000000-0000-4000-8000-000000000001',
        sellpiaProductCode: 'SP-1',
        name: '말랑이',
        optionName: null,
        barcode: null,
        currentStock: 0,
        purchasePrice: null,
        salePrice: 3000,
        stockValue: null,
        lastImportRunId: null,
        lastImportedAt: null,
      }]}
      page={1}
      pageSize={50}
      total={1}
      onPageChange={vi.fn()}
    />);

    expect(screen.getByText('SP-1')).toBeInTheDocument();
    expect(screen.getAllByText('가격 미등록')).toHaveLength(2);
    expect(screen.getByText('가져오기 기록 없음')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /입고|출고|조정|설정/ })).not.toBeInTheDocument();
  });
});
