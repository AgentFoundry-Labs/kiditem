import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProductOptionTable from '../ProductOptionTable';
import ProductOptionEditModal from '../ProductOptionEditModal';
import ProductOptionFilters, { type ProductOptionFilterState } from '../ProductOptionFilters';
import type { ProductOption } from '@kiditem/shared/product';

const option: ProductOption = {
  id: '11111111-1111-4111-8111-111111111111',
  masterId: '22222222-2222-4222-8222-222222222222',
  companyId: '33333333-3333-4333-8333-333333333333',
  sku: 'M-00000001-01',
  barcode: '8801234567890',
  legacyCode: '10349-1',
  optionName: '블루 / S',
  sortOrder: 0,
  costPrice: 1000,
  sellPrice: 2000,
  commissionRate: null,
  shippingCost: null,
  otherCost: 0,
  isBundle: false,
  availableStock: null,
  isDeleted: false,
  deletedAt: null,
  isTemporary: false,
  temporaryReason: null,
  isActive: true,
  createdAt: '2026-04-26T00:00:00.000Z',
  updatedAt: '2026-04-26T00:00:00.000Z',
};

const filterState: ProductOptionFilterState = {
  search: '',
  bundleScope: 'all',
  activeScope: 'active',
  temporaryOnly: false,
  includeDeleted: false,
};

describe('product option management barcode boundary', () => {
  it('keeps barcode data out of the option list table', () => {
    render(
      <ProductOptionTable
        items={[option]}
        isLoading={false}
        onEdit={vi.fn()}
        onSoftDelete={vi.fn()}
        onRestore={vi.fn()}
      />,
    );

    expect(screen.queryByText('옵션 바코드')).not.toBeInTheDocument();
    expect(screen.queryByText(option.barcode!)).not.toBeInTheDocument();
    expect(screen.getByText(option.legacyCode!)).toBeInTheDocument();
  });

  it('does not expose barcode as an editable ProductOption field', () => {
    const onSave = vi.fn();
    render(
      <ProductOptionEditModal
        option={option}
        saving={false}
        errorMessage={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(screen.queryByText(/옵션 바코드/)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(option.barcode!)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('barcode');
  });

  it('does not advertise barcode search from the option filter box', () => {
    render(
      <ProductOptionFilters
        draftSearch=""
        state={filterState}
        onSearchInputChange={vi.fn()}
        onSearchSubmit={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByPlaceholderText(/바코드/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/SKU · 옵션명 · 판매자 상품코드 검색/)).toBeInTheDocument();
  });
});
