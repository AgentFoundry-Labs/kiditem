import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryService } from '../inventory.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BundleStockService } from '../../../products/application/service/bundle-stock.service';

describe('InventoryService.issue', () => {
  let service: InventoryService;
  let prisma: any;
  let tx: any;
  let bundleStock: any;

  beforeEach(async () => {
    tx = {
      $queryRaw: vi.fn(),
      inventory: { findFirst: vi.fn(), update: vi.fn() },
      productOption: { findFirst: vi.fn().mockResolvedValue({ optionName: null }) },
      stockTransaction: { create: vi.fn().mockResolvedValue({
        id: 't1', optionId: 'o1', type: 'ISSUE', quantity: 3, unitCost: 0, createdAt: new Date(),
      })},
    };
    prisma = { $transaction: vi.fn(async (cb: any) => cb(tx)) };
    bundleStock = { recomputeForComponent: vi.fn().mockResolvedValue([]) };
    const m = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: BundleStockService, useValue: bundleStock },
      ],
    }).compile();
    service = m.get(InventoryService);
  });

  it('decrements currentStock by quantity', async () => {
    tx.inventory.findFirst.mockResolvedValue({ id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 10, reservedStock: 0, lastRestockedAt: null });
    tx.inventory.update.mockResolvedValue({ id: 'i1', optionId: 'o1', companyId: 'c1', currentStock: 7, reservedStock: 0, safetyStock: 0, reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null, dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: null, createdAt: new Date(), updatedAt: new Date() });

    await service.issue('i1', { quantity: 3, relatedId: 'order-1', relatedType: 'Order' }, 'c1', 'user-1');

    expect(tx.inventory.update.mock.calls[0][0].data.currentStock).toEqual({ increment: -3 });
    const txData = tx.stockTransaction.create.mock.calls[0][0].data;
    expect(txData.type).toBe('ISSUE');
    expect(txData.quantity).toBe(3);
    expect(txData.relatedId).toBe('order-1');
    expect(txData.relatedType).toBe('Order');
  });

  it('insufficient stock → BadRequest, rollback', async () => {
    tx.inventory.findFirst.mockResolvedValue({ id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 2, reservedStock: 0, lastRestockedAt: null });
    await expect(service.issue('i1', { quantity: 5 }, 'c1', 'user-1')).rejects.toThrow(BadRequestException);
    expect(tx.inventory.update).not.toHaveBeenCalled();
    expect(tx.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('does not bump lastRestockedAt', async () => {
    const existingDate = new Date('2024-01-01T00:00:00Z');
    tx.inventory.findFirst.mockResolvedValue({ id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 10, reservedStock: 0, lastRestockedAt: existingDate });
    tx.inventory.update.mockResolvedValue({ id: 'i1', optionId: 'o1', companyId: 'c1', currentStock: 7, reservedStock: 0, safetyStock: 0, reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null, dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: existingDate, createdAt: new Date(), updatedAt: new Date() });

    await service.issue('i1', { quantity: 3 }, 'c1', 'user-1');

    expect(tx.inventory.update.mock.calls[0][0].data.lastRestockedAt).toBe(existingDate);
  });
});
