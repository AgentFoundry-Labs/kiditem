import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StockAssets from './StockAssets';

const listSellpiaInventorySkus = vi.hoisted(() => vi.fn());

vi.mock('../../_shared/inventory-api', () => ({
  listSellpiaInventorySkus,
}));

function renderAssets() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StockAssets />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listSellpiaInventorySkus.mockReset();
  listSellpiaInventorySkus.mockResolvedValue({
    items: [{
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000001',
      code: 'SP-1',
      name: '가격 없는 상품',
      optionName: null,
      barcode: null,
      currentStock: 4,
      purchasePrice: null,
      salePrice: 1000,
      isActive: true,
      stockValue: null,
      lastImportRunId: null,
      lastImportedAt: null,
    }],
    total: 1,
    page: 1,
    limit: 50,
    summary: {
      totalSkus: 1,
      inStockSkus: 1,
      outOfStockSkus: 0,
      totalUnits: 4,
      pricedAssetValue: 0,
      unpricedSkuCount: 1,
    },
    latestImport: null,
  });
});

describe('StockAssets', () => {
  it('keys physical inventory rows by Sellpia inventory SKU identity', () => {
    const source = readFileSync(resolve(
      process.cwd().endsWith('/apps/web') ? process.cwd() : resolve(process.cwd(), 'apps/web'),
      'src/app/(inventory)/inventory-hub/components/StockAssets.tsx',
    ), 'utf8');

    expect(source).toContain('key={item.sellpiaInventorySkuId}');
    expect(source).not.toContain('item.masterProductId');
  });

  it('uses the backend summary and labels nullable purchase prices as unpriced', async () => {
    renderAssets();

    expect(await screen.findByText('가격 없는 상품')).toBeInTheDocument();
    expect(screen.getByText('평가 재고자산')).toBeInTheDocument();
    expect(screen.getByText('가격 미등록 SKU')).toBeInTheDocument();
    expect(screen.getByText('가격 미등록')).toBeInTheDocument();
  });

  it('requests and renders the selected server page with the full result total', async () => {
    listSellpiaInventorySkus.mockImplementation(async ({ page, limit }) => ({
      items: [{
        sellpiaInventorySkuId: page === 1
          ? '00000000-0000-4000-8000-000000000001'
          : '00000000-0000-4000-8000-000000000002',
        code: page === 1 ? 'SP-PAGE-1' : 'SP-PAGE-2',
        name: page === 1 ? '첫 페이지 상품' : '둘째 페이지 상품',
        optionName: null,
        barcode: null,
        currentStock: 4,
        purchasePrice: 100,
        salePrice: 1000,
        isActive: true,
        stockValue: 400,
        lastImportRunId: null,
        lastImportedAt: null,
      }],
      total: 51,
      page,
      limit,
      summary: {
        totalSkus: 51,
        inStockSkus: 51,
        outOfStockSkus: 0,
        totalUnits: 204,
        pricedAssetValue: 20_400,
        unpricedSkuCount: 0,
      },
      latestImport: null,
    }));
    renderAssets();

    expect(await screen.findByText('첫 페이지 상품')).toBeInTheDocument();
    expect(screen.getByText('51건 중 1-50')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2' }));

    expect(await screen.findByText('둘째 페이지 상품')).toBeInTheDocument();
    await waitFor(() => expect(listSellpiaInventorySkus).toHaveBeenLastCalledWith({
      page: 2,
      limit: 50,
    }));
    expect(screen.getByText('51건 중 51-51')).toBeInTheDocument();
  });
});
