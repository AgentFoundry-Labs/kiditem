import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ReturnTransfersService } from './return-transfers.service';

describe('ReturnTransfersService', () => {
  it('creates a record-only return transfer for an organization-owned InventorySku', async () => {
    const created = { id: 'return-transfer-1', inventorySkuId: 'inventory-sku-1' };
    const prisma = {
      inventorySku: {
        findFirst: vi.fn().mockResolvedValue({ id: 'inventory-sku-1', optionName: '빨강' }),
      },
      returnTransfer: {
        create: vi.fn().mockResolvedValue(created),
      },
    };
    const service = new ReturnTransfersService(prisma as never);

    await expect(service.create('org-1', {
      inventorySkuId: 'inventory-sku-1',
      orderId: 'order-1',
      quantity: 2,
      condition: 'good',
      notes: 'record only',
    })).resolves.toBe(created);

    expect(prisma.inventorySku.findFirst).toHaveBeenCalledWith({
      where: { id: 'inventory-sku-1', organizationId: 'org-1' },
      select: { optionName: true },
    });
    expect(prisma.returnTransfer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        inventorySkuId: 'inventory-sku-1',
        optionName: '빨강',
        orderId: 'order-1',
        quantity: 2,
      }),
      include: { inventorySku: true },
    });
  });

  it('rejects an InventorySku outside the organization', async () => {
    const prisma = {
      inventorySku: { findFirst: vi.fn().mockResolvedValue(null) },
      returnTransfer: { create: vi.fn() },
    };
    const service = new ReturnTransfersService(prisma as never);

    await expect(service.create('org-1', {
      inventorySkuId: 'foreign-inventory-sku',
      quantity: 1,
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.returnTransfer.create).not.toHaveBeenCalled();
  });

  it('updates disposition fields without invoking any stock mutation surface', async () => {
    const prisma = {
      returnTransfer: {
        findFirst: vi.fn().mockResolvedValue({ id: 'return-transfer-1' }),
        update: vi.fn().mockResolvedValue({ id: 'return-transfer-1', status: 'completed' }),
      },
    };
    const service = new ReturnTransfersService(prisma as never);

    await service.update('return-transfer-1', {
      status: 'completed',
      restockedQty: 1,
      disposedQty: 1,
    }, 'org-1');

    expect(prisma.returnTransfer.update).toHaveBeenCalledWith({
      where: { id: 'return-transfer-1' },
      data: {
        status: 'completed',
        restockedQty: 1,
        disposedQty: 1,
      },
      include: { inventorySku: true },
    });
  });
});
