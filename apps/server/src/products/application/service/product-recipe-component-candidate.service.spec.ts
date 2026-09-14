import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProductRecipeComponentCandidateService } from './product-recipe-component-candidate.service';
import type { InventoryAvailabilityPort } from '../../../inventory/application/port/in/stock/inventory-availability.port';

const organizationId = '00000000-0000-4000-8000-000000000001';
const skuId = '00000000-0000-4000-8000-000000000002';

describe('ProductRecipeComponentCandidateService', () => {
  it('returns the bounded Inventory-owned availability search', async () => {
    const inventory = makeInventory([{
      sellpiaInventorySkuId: skuId,
      code: 'SP-001',
      name: '식판',
      optionName: '분홍',
      barcode: '8800000000001',
      currentStock: 8,
    }]);
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
    expect(inventory.searchCandidates).toHaveBeenCalledWith({
      organizationId,
      query: 'SP-001',
      limit: 20,
      stockStatus: 'in_stock',
    });
  });

  it('keeps uncollected identities nullable for the explicit all-stock search', async () => {
    const inventory = makeInventory([{
      sellpiaInventorySkuId: skuId,
      code: 'SP-001',
      name: '식판',
      optionName: null,
      barcode: null,
      currentStock: null,
    }]);
    const service = new ProductRecipeComponentCandidateService(inventory);

    await expect(service.search(organizationId, {
      search: 'SP-001',
      limit: 20,
      stockStatus: 'all',
    })).resolves.toMatchObject({
      items: [{ sellpiaInventorySkuId: skuId, currentStock: null }],
    });
  });

  it('rejects unbounded or tenant-bearing candidate queries before Inventory reads', async () => {
    const inventory = makeInventory([]);
    const service = new ProductRecipeComponentCandidateService(inventory);

    await expect(service.search(organizationId, { search: 'x', limit: 100 }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.search(organizationId, { search: 'SP', organizationId }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(inventory.searchCandidates).not.toHaveBeenCalled();
  });
});

function makeInventory(
  rows: Awaited<ReturnType<InventoryAvailabilityPort['searchCandidates']>>,
) {
  return {
    findBySkuIds: vi.fn(),
    searchCandidates: vi.fn().mockResolvedValue(rows),
  } as unknown as {
    [K in keyof InventoryAvailabilityPort]: ReturnType<typeof vi.fn>;
  };
}
