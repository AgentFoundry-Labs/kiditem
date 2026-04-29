import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { InventoryService } from '../inventory.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BundleStockService } from '../../../products/application/service/bundle-stock.service';

describe('InventoryService.adjust', () => {
  let service: InventoryService;
  let tx: any;

  beforeEach(async () => {
    tx = {
      $queryRaw: vi.fn(),
      inventory: { findFirst: vi.fn(), update: vi.fn() },
      productOption: { findFirst: vi.fn().mockResolvedValue({ optionName: null }) },
      stockTransaction: { create: vi.fn().mockResolvedValue({
        id: 't1', optionId: 'o1', type: 'ADJUST', quantity: 4, unitCost: 0, createdAt: new Date(),
      })},
    };
    const prisma = { $transaction: vi.fn(async (cb: any) => cb(tx)) };
    const bundleStock = { recomputeForComponent: vi.fn().mockResolvedValue([]) };
    const m = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: BundleStockService, useValue: bundleStock },
      ],
    }).compile();
    service = m.get(InventoryService);
  });

  it('positive delta increments', async () => {
    tx.inventory.findFirst.mockResolvedValue({ id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 10, reservedStock: 0, lastRestockedAt: null });
    tx.inventory.update.mockResolvedValue({ id: 'i1', optionId: 'o1', companyId: 'c1', currentStock: 14, reservedStock: 0, safetyStock: 0, reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null, dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: null, createdAt: new Date(), updatedAt: new Date() });

    await service.adjust('i1', { delta: 4, reason: 'recount' }, 'c1', 'user-1');

    expect(tx.inventory.update.mock.calls[0][0].data.currentStock).toEqual({ increment: 4 });
    const txData = tx.stockTransaction.create.mock.calls[0][0].data;
    expect(txData.type).toBe('ADJUST');
    expect(txData.quantity).toBe(4);
    expect(txData.note).toBe('recount');
  });

  it('negative delta decrements with bounds check', async () => {
    tx.inventory.findFirst.mockResolvedValue({ id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 10, reservedStock: 0, lastRestockedAt: null });
    tx.inventory.update.mockResolvedValue({ id: 'i1', optionId: 'o1', companyId: 'c1', currentStock: 6, reservedStock: 0, safetyStock: 0, reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null, dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: null, createdAt: new Date(), updatedAt: new Date() });

    await service.adjust('i1', { delta: -4, reason: 'shrinkage' }, 'c1', 'user-1');
    expect(tx.inventory.update.mock.calls[0][0].data.currentStock).toEqual({ increment: -4 });
    // ADJUST persists the signed delta so the ledger preserves direction;
    // aggregations downstream (StockMovementTab, StockLedger) read this signed value.
    expect(tx.stockTransaction.create.mock.calls[0][0].data.quantity).toBe(-4);
  });

  it('negative delta exceeding stock → BadRequest', async () => {
    tx.inventory.findFirst.mockResolvedValue({ id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 3, reservedStock: 0, lastRestockedAt: null });
    await expect(service.adjust('i1', { delta: -5, reason: 'shrinkage' }, 'c1', 'user-1'))
      .rejects.toThrow(BadRequestException);
  });
});
