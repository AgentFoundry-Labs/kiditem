import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProductRecipeComponentCandidateService } from './product-recipe-component-candidate.service';
import type { SellpiaInventorySkuReadPort } from '../../../inventory/application/port/in/stock/sellpia-inventory-sku-read.port';

const organizationId = '00000000-0000-4000-8000-000000000001';
const skuId = '00000000-0000-4000-8000-000000000002';

describe('ProductRecipeComponentCandidateService', () => {
  it('returns only active physical identity fields through the tenant-scoped Inventory port', async () => {
    const inventory = makeInventory();
    inventory.search.mockResolvedValueOnce([
      {
        sellpiaInventorySkuId: skuId,
        code: 'SP-001',
        name: '식판',
        optionName: '분홍',
        barcode: '8800000000001',
        currentStock: 8,
        purchasePrice: 5_000,
        salePrice: 9_000,
        isActive: true,
        lastImportRunId: null,
      },
      {
        sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000003',
        code: 'SP-INACTIVE',
        name: '비활성',
        optionName: null,
        barcode: null,
        currentStock: 0,
        purchasePrice: null,
        salePrice: null,
        isActive: false,
        lastImportRunId: null,
      },
    ]);
    const service = new ProductRecipeComponentCandidateService(inventory);

    await expect(service.search(organizationId, {
      search: '  SP-001  ',
      limit: 20,
    })).resolves.toEqual({
      items: [{
        sellpiaInventorySkuId: skuId,
        code: 'SP-001',
        name: '식판',
        optionName: '분홍',
        barcode: '8800000000001',
        currentStock: 8,
      }],
    });
    expect(inventory.search).toHaveBeenCalledWith(organizationId, 'SP-001', 20);
  });

  it('rejects unbounded or tenant-bearing candidate queries before Inventory reads', async () => {
    const inventory = makeInventory();
    const service = new ProductRecipeComponentCandidateService(inventory);

    await expect(service.search(organizationId, { search: 'x', limit: 100 }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.search(organizationId, { search: 'SP', organizationId }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(inventory.search).not.toHaveBeenCalled();
  });
});

function makeInventory() {
  return {
    findByIds: vi.fn(),
    findByCodes: vi.fn(),
    findByBarcodes: vi.fn(),
    findByNormalizedNames: vi.fn(),
    search: vi.fn(),
  } as unknown as {
    [K in keyof SellpiaInventorySkuReadPort]: ReturnType<typeof vi.fn>;
  };
}
