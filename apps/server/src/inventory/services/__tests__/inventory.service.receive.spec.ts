import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InventoryService } from '../inventory.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BundleStockService } from '../../../products/application/service/bundle-stock.service';

describe('InventoryService.receive', () => {
  let service: InventoryService;
  let prisma: any;
  let bundleStock: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      $queryRaw: vi.fn(),
      inventory: { findFirst: vi.fn(), update: vi.fn() },
      productOption: { findFirst: vi.fn(), findUnique: vi.fn() },
      stockTransaction: { create: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (cb: any) => cb(tx)),
    };
    bundleStock = {
      recomputeForComponent: vi.fn().mockResolvedValue([]),
    };
    const m = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: BundleStockService, useValue: bundleStock },
      ],
    }).compile();
    service = m.get(InventoryService);
  });

  it('atomic sequence: lock → update → ledger → fan-out', async () => {
    tx.inventory.findFirst.mockResolvedValue({
      id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 10, reservedStock: 0,
      lastRestockedAt: null,
    });
    tx.inventory.update.mockResolvedValue({
      id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 15, reservedStock: 0,
      safetyStock: 0, reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null,
      dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: new Date(),
      createdAt: new Date(), updatedAt: new Date(),
    });
    tx.productOption.findFirst.mockResolvedValue({ optionName: 'Red' });
    tx.stockTransaction.create.mockResolvedValue({
      id: 'tx1', optionId: 'o1', type: 'RECEIVE', quantity: 5, unitCost: 100,
      createdAt: new Date(),
    });
    bundleStock.recomputeForComponent.mockResolvedValue(['bundle-A']);

    const result = await service.receive('i1', { quantity: 5, unitCost: 100 }, 'c1', 'user-1');

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.inventory.findFirst).toHaveBeenCalledWith({ where: { id: 'i1', companyId: 'c1' } });
    expect(tx.productOption.findFirst).toHaveBeenCalledWith({
      where: { id: 'o1', companyId: 'c1' },
      select: { optionName: true },
    });
    expect(tx.inventory.update.mock.calls[0][0].data.currentStock).toEqual({ increment: 5 });
    expect(tx.stockTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'c1', optionId: 'o1', type: 'RECEIVE',
        quantity: 5, unitCost: 100, totalCost: 500,
        optionName: 'Red', createdBy: 'user-1',
      }),
    });
    expect(bundleStock.recomputeForComponent).toHaveBeenCalledWith('c1', 'o1', tx);
    expect(result.inventory.currentStock).toBe(15);
    expect(result.transaction.type).toBe('RECEIVE');
    expect(result.recomputedBundleOptionIds).toEqual(['bundle-A']);
  });

  it('wrong company → NotFound, no mutation', async () => {
    tx.inventory.findFirst.mockResolvedValue(null);
    await expect(service.receive('i1', { quantity: 5 }, 'c2', 'user-1'))
      .rejects.toThrow(NotFoundException);
    expect(tx.inventory.update).not.toHaveBeenCalled();
    expect(tx.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('unitCost defaults to 0', async () => {
    tx.inventory.findFirst.mockResolvedValue({ id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 10, reservedStock: 0, lastRestockedAt: null });
    tx.inventory.update.mockResolvedValue({ id: 'i1', optionId: 'o1', companyId: 'c1', currentStock: 15, reservedStock: 0, safetyStock: 0, reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null, dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
    tx.productOption.findFirst.mockResolvedValue({ optionName: null });
    tx.stockTransaction.create.mockResolvedValue({ id: 'tx1', optionId: 'o1', type: 'RECEIVE', quantity: 5, unitCost: 0, createdAt: new Date() });

    await service.receive('i1', { quantity: 5 }, 'c1', 'user-1');
    const txCall = tx.stockTransaction.create.mock.calls[0][0];
    expect(txCall.data.unitCost).toBe(0);
    expect(txCall.data.totalCost).toBe(0);
  });

  it('does not copy optionName from another company when ledgering', async () => {
    tx.inventory.findFirst.mockResolvedValue({
      id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 10, reservedStock: 0,
      lastRestockedAt: null,
    });
    tx.inventory.update.mockResolvedValue({
      id: 'i1', optionId: 'o1', companyId: 'c1', currentStock: 15, reservedStock: 0,
      safetyStock: 0, reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null,
      dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: new Date(),
      createdAt: new Date(), updatedAt: new Date(),
    });
    tx.productOption.findFirst.mockResolvedValue(null);
    tx.productOption.findUnique.mockResolvedValue({ optionName: 'Other tenant option' });
    tx.stockTransaction.create.mockResolvedValue({
      id: 'tx1', optionId: 'o1', type: 'RECEIVE', quantity: 5, unitCost: 0,
      createdAt: new Date(),
    });

    await service.receive('i1', { quantity: 5 }, 'c1', 'user-1');

    expect(tx.stockTransaction.create.mock.calls[0][0].data.optionName).toBeNull();
  });
});
