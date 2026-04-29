import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { InventoryService } from '../inventory.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BundleStockService } from '../../../products/application/service/bundle-stock.service';

describe('InventoryService — ledger reads', () => {
  let service: InventoryService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      stockTransaction: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
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

  describe('listTransactions', () => {
    it('applies companyId + filters + pagination', async () => {
      prisma.stockTransaction.findMany.mockResolvedValue([
        { id: 't1', optionId: 'o1', optionName: 'R', type: 'RECEIVE', quantity: 5, unitCost: 100, totalCost: 500, warehouseId: null, relatedId: null, relatedType: null, note: null, createdBy: 'u1', createdAt: new Date() },
      ]);
      prisma.stockTransaction.count.mockResolvedValue(1);

      const result = await service.listTransactions({ optionId: 'o1', type: 'RECEIVE', page: 1, limit: 50 }, 'c1');

      expect(result.items).toHaveLength(1);
      const call = prisma.stockTransaction.findMany.mock.calls[0][0];
      expect(call.where.companyId).toBe('c1');
      expect(call.where.optionId).toBe('o1');
      expect(call.where.type).toBe('RECEIVE');
    });

    it('date range filter', async () => {
      prisma.stockTransaction.findMany.mockResolvedValue([]);
      prisma.stockTransaction.count.mockResolvedValue(0);
      await service.listTransactions({ from: '2024-01-01', to: '2024-12-31' }, 'c1');
      const call = prisma.stockTransaction.findMany.mock.calls[0][0];
      expect(call.where.createdAt.gte).toEqual(new Date('2024-01-01'));
      expect(call.where.createdAt.lte).toEqual(new Date('2024-12-31'));
    });
  });

  describe('getTransactionSummary', () => {
    it('returns aggregated in/out/adjust with days default', async () => {
      prisma.stockTransaction.groupBy.mockResolvedValue([
        { type: 'RECEIVE', _sum: { quantity: 100, totalCost: 10000 } },
        { type: 'ISSUE', _sum: { quantity: 30, totalCost: 3000 } },
        { type: 'ADJUST', _sum: { quantity: 5, totalCost: 0 } },
      ]);

      const result = await service.getTransactionSummary({ days: 30 }, 'c1');

      expect(result.inQty).toBe(100);
      expect(result.outQty).toBe(30);
      expect(result.adjustQty).toBe(5);
      expect(result.inAmount).toBe(10000);
      expect(result.outAmount).toBe(3000);
    });
  });
});
