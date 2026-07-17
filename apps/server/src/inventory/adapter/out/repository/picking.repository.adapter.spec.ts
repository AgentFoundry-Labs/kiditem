import { describe, expect, it, vi } from 'vitest';
import { PickingRepositoryAdapter } from './picking.repository.adapter';

describe('PickingRepositoryAdapter', () => {
  it('validates and writes the physical Sellpia inventory SKU on new picking items', async () => {
    const tx = {
      sellpiaInventorySku: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'sku-1' },
        ]),
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
      sellpiaInventorySkuId: 'sku-1',
      productName: 'Kids rain boots',
      sku: 'SP-001',
      quantity: 2,
    }]);

    expect(tx.pickingList.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        items: {
          create: [expect.objectContaining({
            sellpiaInventorySkuId: 'sku-1',
          })],
        },
      }),
      include: expect.any(Object),
    });
  });
});
