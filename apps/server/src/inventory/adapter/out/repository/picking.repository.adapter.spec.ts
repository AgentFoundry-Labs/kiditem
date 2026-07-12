import { describe, expect, it, vi } from 'vitest';
import { PickingRepositoryAdapter } from './picking.repository.adapter';

describe('PickingRepositoryAdapter expand compatibility', () => {
  it('dual-writes current InventorySku and retained ProductOption identity on new picking items', async () => {
    const tx = {
      inventorySku: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'inventory-sku-1', sellpiaProductCode: 'SP-001' },
        ]),
      },
      productOption: {
        findMany: vi.fn().mockResolvedValue([{ id: 'option-1', legacyCode: 'SP-001', sku: 'OLD-1' }]),
      },
      pickingList: {
        create: vi.fn().mockResolvedValue({ id: 'picking-list-1', items: [] }),
      },
    };
    const prisma = {
      $transaction: vi.fn((operation: (scope: typeof tx) => unknown) => operation(tx)),
    };
    const repository = new PickingRepositoryAdapter(prisma as never);

    await repository.createPickingList('org-1', 'PK-1', [{
      orderId: 'order-1',
      inventorySkuId: 'inventory-sku-1',
      productName: 'Kids rain boots',
      sku: 'SP-001',
      quantity: 2,
    }]);

    expect(tx.pickingList.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        items: {
          create: [expect.objectContaining({
            organizationId: 'org-1',
            optionId: 'option-1',
            inventorySkuId: 'inventory-sku-1',
          })],
        },
      }),
      include: expect.any(Object),
    });
  });
});
