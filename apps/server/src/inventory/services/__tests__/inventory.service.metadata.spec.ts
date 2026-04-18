import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InventoryService } from '../inventory.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BundleStockService } from '../../../products/services/bundle-stock.service';

describe('InventoryService — metadata update', () => {
  let service: InventoryService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      inventory: { findFirst: vi.fn(), update: vi.fn() },
    };
    const m = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: BundleStockService, useValue: {} },
      ],
    }).compile();
    service = m.get(InventoryService);
  });

  it('updates allowed fields only — currentStock never passed to update', async () => {
    prisma.inventory.findFirst.mockResolvedValue({ id: 'i1', companyId: 'c1' });
    prisma.inventory.update.mockResolvedValue({
      id: 'i1', optionId: 'o1', companyId: 'c1',
      currentStock: 999,
      reservedStock: 0, safetyStock: 20,
      reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null,
      dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    await service.updateMetadata('i1', { safetyStock: 20 }, 'c1');

    const call = prisma.inventory.update.mock.calls[0][0];
    expect(call.data.currentStock).toBeUndefined();
    expect(call.data.reservedStock).toBeUndefined();
    expect(call.data.safetyStock).toBe(20);
  });

  it('wrong company → NotFound', async () => {
    prisma.inventory.findFirst.mockResolvedValue(null);
    await expect(service.updateMetadata('i1', { safetyStock: 20 }, 'c2'))
      .rejects.toThrow(NotFoundException);
  });
});
