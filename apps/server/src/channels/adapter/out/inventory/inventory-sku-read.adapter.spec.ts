import { describe, expect, it, vi } from 'vitest';
import type { SellpiaMasterProductReadPort } from '../../../../inventory/application/port/in/stock/sellpia-master-product-read.port';
import { ChannelsInventorySkuReadAdapter } from './inventory-sku-read.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';

describe('ChannelsInventorySkuReadAdapter', () => {
  it('preserves nullable purchase price as channel availability evidence', async () => {
    const owner = {
      findByIds: vi.fn().mockResolvedValue([{
        id: '00000000-0000-4000-8000-000000000002',
        code: 'SP-001',
        name: 'Sellpia item',
        optionName: null,
        barcode: null,
        currentStock: 8,
        purchasePrice: 1_500,
        salePrice: 2_500,
        isActive: true,
        lastImportRunId: null,
      }]),
    } as unknown as SellpiaMasterProductReadPort;
    const adapter = new ChannelsInventorySkuReadAdapter(owner);

    const result = await adapter.findByIds(organizationId, [
      '00000000-0000-4000-8000-000000000002',
    ]);

    expect(result[0]?.purchasePrice).toBe(1_500);
  });
});
