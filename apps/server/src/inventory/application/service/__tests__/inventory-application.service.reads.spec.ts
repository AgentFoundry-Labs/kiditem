import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { InventoryApplicationService } from '../inventory-application.service';
import type { InventoryQuery } from '../../../adapter/out/prisma/inventory.query';
import type { InventoryPersistence } from '../../../adapter/out/prisma/inventory.persistence';
import type { BundleStockService } from '../../../../products/application/service/bundle-stock.service';

function makeQuery() {
  return {
    listInventoryWithOption: vi.fn(),
    findInventoryById: vi.fn(),
    findInventoryByOptionId: vi.fn(),
    listStockTransactions: vi.fn(),
    groupTransactionsByType: vi.fn(),
  } satisfies Record<keyof InventoryQuery, ReturnType<typeof vi.fn>>;
}

describe('InventoryApplicationService — reads', () => {
  let service: InventoryApplicationService;
  let query: ReturnType<typeof makeQuery>;

  beforeEach(() => {
    query = makeQuery();
    service = new InventoryApplicationService(
      query as unknown as InventoryQuery,
      {} as InventoryPersistence,
      {} as BundleStockService,
    );
  });

  describe('list', () => {
    it('returns paged items with summary + derived status; companyId filter from arg', async () => {
      query.listInventoryWithOption.mockResolvedValue({
        rows: [
          {
            id: 'inv-1', optionId: 'opt-1', currentStock: 100, reservedStock: 0,
            safetyStock: 10, reorderPoint: 20, reorderQuantity: 50, leadTimeDays: 14,
            dailySalesAvg: 5, warehouseLocation: 'A-1', lastRestockedAt: null,
            createdAt: new Date(), updatedAt: new Date(), companyId: 'c1',
            option: {
              masterId: 'm1', sku: 'SKU-1', optionName: 'Red', isBundle: false,
              availableStock: null, isDeleted: false,
              master: { name: 'Product 1' },
            },
          },
        ],
        dbCount: 1,
      });

      const result = await service.list({}, 'c1');

      expect(query.listInventoryWithOption).toHaveBeenCalledWith('c1', { optionId: undefined, masterId: undefined });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].sku).toBe('SKU-1');
      expect(result.items[0].status).toBe('healthy');
      expect(result.items[0].kind).toBe('SIMPLE');
      expect(result.summary.total).toBe(1);
      expect(result.summary.healthy).toBe(1);
    });

    it('bundle option uses availableStock', async () => {
      query.listInventoryWithOption.mockResolvedValue({
        rows: [
          {
            id: 'inv-b', optionId: 'opt-b', currentStock: 0, reservedStock: 0,
            safetyStock: 0, reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null,
            dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: null,
            createdAt: new Date(), updatedAt: new Date(), companyId: 'c1',
            option: {
              masterId: 'm1', sku: 'BDL-1', optionName: null, isBundle: true,
              availableStock: 5, isDeleted: false,
              master: { name: 'Bundle A' },
            },
          },
        ],
        dbCount: 1,
      });

      const result = await service.list({}, 'c1');

      expect(result.items[0].kind).toBe('BUNDLE');
      expect(result.items[0].availableStock).toBe(5);
    });
  });

  describe('findById / findByOptionId', () => {
    it('returns inventory when owned by company', async () => {
      query.findInventoryById.mockResolvedValue({
        id: 'inv-1', optionId: 'opt-1', companyId: 'c1',
        currentStock: 50, reservedStock: 0, safetyStock: 0, reorderPoint: 0,
        reorderQuantity: 0, leadTimeDays: null, dailySalesAvg: 0,
        warehouseLocation: null, lastRestockedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      });
      const result = await service.findById('inv-1', 'c1');
      expect(result.id).toBe('inv-1');
      expect(query.findInventoryById).toHaveBeenCalledWith('inv-1', 'c1');
    });

    it('throws NotFound on wrong tenant', async () => {
      query.findInventoryById.mockResolvedValue(null);
      await expect(service.findById('inv-1', 'c2')).rejects.toThrow(NotFoundException);
    });

    it('findByOptionId scopes by company', async () => {
      query.findInventoryByOptionId.mockResolvedValue({
        id: 'inv-1', optionId: 'opt-1', companyId: 'c1',
        currentStock: 50, reservedStock: 0, safetyStock: 0, reorderPoint: 0,
        reorderQuantity: 0, leadTimeDays: null, dailySalesAvg: 0,
        warehouseLocation: null, lastRestockedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      });
      const result = await service.findByOptionId('opt-1', 'c1');
      expect(result.optionId).toBe('opt-1');
      expect(query.findInventoryByOptionId).toHaveBeenCalledWith('opt-1', 'c1');
    });
  });

  describe('listTransactions / getTransactionSummary', () => {
    it('passes filters + pagination', async () => {
      query.listStockTransactions.mockResolvedValue({
        rows: [
          {
            id: 't1', companyId: 'c1', optionId: 'o1', optionName: 'R', type: 'RECEIVE',
            quantity: 5, unitCost: 100, totalCost: 500,
            warehouseId: null, relatedId: null, relatedType: null, note: null,
            createdBy: 'u1', createdAt: new Date(),
          },
        ],
        total: 1,
      });
      const result = await service.listTransactions(
        { optionId: 'o1', type: 'RECEIVE', page: 1, limit: 50 },
        'c1',
      );
      expect(result.items).toHaveLength(1);
      expect(query.listStockTransactions).toHaveBeenCalledWith(
        'c1',
        { optionId: 'o1', type: 'RECEIVE', from: undefined, to: undefined },
        0,
        50,
      );
    });

    it('summary aggregates RECEIVE/ISSUE/ADJUST', async () => {
      query.groupTransactionsByType.mockResolvedValue([
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
