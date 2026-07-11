import { describe, expect, it, vi } from 'vitest';
import type { InventorySkuReadPort } from '../../../../inventory/application/port/in/stock/inventory-sku-read.port';
import { ChannelsInventorySkuReadAdapter } from './inventory-sku-read.adapter';

const organizationId = '00000000-0000-4000-8000-000000000001';

describe('ChannelsInventorySkuReadAdapter', () => {
  it('preserves nullable purchase price as channel availability evidence', async () => {
    const owner = {
      findByIds: vi.fn().mockResolvedValue([{
        id: '00000000-0000-4000-8000-000000000002',
        sellpiaProductCode: 'SP-001',
        name: 'Sellpia item',
        optionName: null,
        barcode: null,
        currentStock: 8,
        purchasePrice: 1_500,
      }]),
    } as unknown as InventorySkuReadPort;
    const adapter = new ChannelsInventorySkuReadAdapter(owner);

    const result = await adapter.findByIds(organizationId, [
      '00000000-0000-4000-8000-000000000002',
    ]);

    expect(result[0]?.purchasePrice).toBe(1_500);
  });
});
