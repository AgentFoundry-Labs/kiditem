import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SellpiaMasterProductPicker from './SellpiaMasterProductPicker';

const listSellpiaInventorySkus = vi.hoisted(() => vi.fn());

vi.mock('../../_shared/inventory-api', () => ({
  listSellpiaInventorySkus,
  sellpiaInventoryKeyParams: (params: Record<string, unknown>) => params,
}));

beforeEach(() => {
  listSellpiaInventorySkus.mockReset();
  listSellpiaInventorySkus.mockResolvedValue({
    items: [{
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000001',
      code: 'SP-1',
      name: '말랑이',
      optionName: '파랑',
      barcode: null,
      currentStock: 8,
      purchasePrice: null,
      salePrice: null,
      isActive: true,
      stockValue: null,
      lastImportRunId: null,
      lastImportedAt: null,
      linkedVariantCount: 0,
      linkedProductCount: 0,
      linkedProducts: [],
      linkedVariants: [],
      linkStatus: 'unlinked',
    }],
    total: 1,
    page: 1,
    limit: 50,
    summary: { totalSkus: 1, inStockSkus: 1, outOfStockSkus: 0, totalUnits: 8, pricedAssetValue: 0, unpricedSkuCount: 1 },
    latestImport: null,
  });
});

describe('SellpiaMasterProductPicker', () => {
  it('returns the selected physical Sellpia inventory SKU id', async () => {
    const onChange = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SellpiaMasterProductPicker value="" onChange={onChange} label="Sellpia 재고 상품" />
      </QueryClientProvider>,
    );

    await screen.findByText(/SP-1 · 말랑이 · 파랑 · 현재고 8/);
    await userEvent.selectOptions(
      screen.getByLabelText('Sellpia 재고 상품'),
      '00000000-0000-4000-8000-000000000001',
    );

    expect(onChange).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
    expect(screen.getByText(/SP-1 · 말랑이 · 파랑 · 현재고 8/)).toBeInTheDocument();
  });
});
