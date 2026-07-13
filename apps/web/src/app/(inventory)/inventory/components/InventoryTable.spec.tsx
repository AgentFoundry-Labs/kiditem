import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InventoryTable } from './InventoryTable';

describe('InventoryTable', () => {
  function renderInventoryTable() {
    render(<InventoryTable
      items={[{
        masterProductId: '00000000-0000-4000-8000-000000000001',
        code: 'SP-1',
        name: '말랑이',
        optionName: null,
        barcode: null,
        currentStock: 0,
        purchasePrice: null,
        salePrice: 3000,
        isActive: true,
        stockValue: null,
        lastImportRunId: null,
        lastImportedAt: null,
      }]}
      page={1}
      pageSize={50}
      total={1}
      onPageChange={vi.fn()}
    />);
  }

  it('uses develop table ordering with current Sellpia fields and no action column', () => {
    renderInventoryTable();

    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      '상품명',
      '옵션',
      'Sellpia 코드',
      '바코드',
      '현재고',
      '매입가',
      '판매가',
      '재고자산',
      '최종 가져오기',
    ]);
    expect(screen.queryByRole('columnheader', { name: '액션' })).not.toBeInTheDocument();
  });

  it('shows Sellpia snapshot values and no stock mutation actions', () => {
    renderInventoryTable();

    expect(screen.getByText('SP-1')).toBeInTheDocument();
    expect(screen.getAllByText('가격 미등록')).toHaveLength(2);
    expect(screen.getByText('가져오기 기록 없음')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /입고|출고|조정|설정/ })).not.toBeInTheDocument();
  });
});
