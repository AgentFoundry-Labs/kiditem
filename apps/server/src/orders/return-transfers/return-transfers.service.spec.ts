import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ReturnTransfersService } from './return-transfers.service';

describe('ReturnTransfersService', () => {
  it('creates a record-only return transfer for an organization-owned physical Master', async () => {
    const created = { id: 'return-transfer-1', masterProductId: 'master-1' };
    const prisma = {
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'master-1',
          optionName: '빨강',
          sellpiaProductCode: 'SP-001',
        }),
      },
      order: { findFirst: vi.fn().mockResolvedValue({ id: 'order-1' }) },
      returnTransfer: {
        create: vi.fn().mockResolvedValue(created),
      },
    };
    const service = new ReturnTransfersService(prisma as never);

    await expect(service.create('org-1', {
      masterProductId: 'master-1',
      orderId: 'order-1',
      quantity: 2,
      condition: 'good',
      notes: 'record only',
    })).resolves.toBe(created);

    expect(prisma.masterProduct.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'master-1',
        organizationId: 'org-1',
        isActive: true,
      },
      select: { optionName: true },
    });
    expect(prisma.returnTransfer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        masterProductId: 'master-1',
        optionName: '빨강',
        orderId: 'order-1',
        quantity: 2,
      }),
      include: { masterProduct: true },
    });
  });

  it('rejects a MasterProduct outside the organization', async () => {
    const prisma = {
      masterProduct: { findFirst: vi.fn().mockResolvedValue(null) },
      returnTransfer: { create: vi.fn() },
    };
    const service = new ReturnTransfersService(prisma as never);

    await expect(service.create('org-1', {
      masterProductId: 'foreign-master',
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
      include: { masterProduct: true },
    });
  });
});
