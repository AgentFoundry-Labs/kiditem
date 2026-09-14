import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InventoryTable } from './InventoryTable';
import type { InventorySkuSnapshotItem } from '@kiditem/shared/inventory';

describe('InventoryTable', () => {
  const item: InventorySkuSnapshotItem = {
    sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000001',
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
    linkedChannelOptionCount: 2,
    linkedProductCount: 1,
    linkedProducts: [{
      id: '10000000-0000-4000-8000-000000000001',
      code: 'INV-SELLPIA-100',
      name: '키즈 반팔 티셔츠',
    }],
    linkedChannelOptions: [{
      id: '20000000-0000-4000-8000-000000000001',
      masterProductId: '10000000-0000-4000-8000-000000000001',
      channelListingId: '30000000-0000-4000-8000-000000000001',
      channel: 'coupang',
      externalOptionId: '13712531060-120',
      itemName: '보라 / 120',
    }],
  };

  function renderInventoryTable(items: InventorySkuSnapshotItem[] = [item]) {
    render(<InventoryTable
      items={items}
      page={1}
      pageSize={50}
      total={1}
      onPageChange={vi.fn()}
    />);
  }

  it('groups every operator-safe Sellpia field into a table that fits the workspace', () => {
    renderInventoryTable();

    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      '상품 정보',
      '식별 정보',
      '재고 · 가격',
      '연결 · 가져오기',
    ]);
    expect(screen.getByRole('table')).toHaveClass('table-fixed');
    expect(screen.getByRole('table').className).not.toContain('min-w-');
    expect(screen.getByText('옵션 없음')).toBeInTheDocument();
    expect(screen.getByText('Sellpia 코드')).toBeInTheDocument();
    expect(screen.getByText('바코드')).toBeInTheDocument();
    expect(screen.getByText('매입가')).toBeInTheDocument();
    expect(screen.getByText('판매가')).toBeInTheDocument();
    expect(screen.getByText('현재고')).toBeInTheDocument();
    expect(screen.getByText('활성')).toBeInTheDocument();
    expect(screen.getByText('최종 가져오기')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Sellpia SKU ID' })).not.toBeInTheDocument();
    expect(screen.queryByText(item.sellpiaInventorySkuId)).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '재고자산' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '액션' })).not.toBeInTheDocument();
  });

  it('shows linked destinations without exposing internal product codes', () => {
    renderInventoryTable();

    expect(screen.getByText('상품 1 · 채널 옵션 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '키즈 반팔 티셔츠' })).toHaveAttribute(
      'href',
      '/product-hub/10000000-0000-4000-8000-000000000001',
    );
    expect(screen.queryByText(/INV-SELLPIA-/)).not.toBeInTheDocument();
  });

  it('shows Sellpia snapshot values and no stock mutation actions', () => {
    renderInventoryTable();

    expect(screen.getByText('SP-1')).toBeInTheDocument();
    expect(screen.getAllByText('가격 미등록')).toHaveLength(1);
    expect(screen.getByText('가져오기 기록 없음')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /입고|출고|조정|설정/ })).not.toBeInTheDocument();
  });

  it('uses semantic surface and text colors while retaining the zero-stock emphasis', () => {
    renderInventoryTable();

    expect(screen.getByRole('table').parentElement?.parentElement).toHaveClass(
      'border-[var(--border)]',
      'bg-[var(--surface)]',
    );
    expect(screen.getByText('말랑이')).toHaveClass('text-[var(--text-primary)]');
    expect(screen.getByText('SP-1')).toHaveClass('text-[var(--text-secondary)]');
    const zeroStockRow = screen.getByText('말랑이').closest('tr');
    expect(zeroStockRow).toHaveClass('bg-red-50/60');
    expect(zeroStockRow?.className).not.toContain('dark:');
  });

  it('uses semantic colors for the empty state', () => {
    renderInventoryTable([]);

    expect(screen.getByText('조건에 맞는 Sellpia 재고가 없습니다.')).toHaveClass(
      'border-[var(--border)]',
      'bg-[var(--surface)]',
      'text-[var(--text-secondary)]',
    );
  });
});
