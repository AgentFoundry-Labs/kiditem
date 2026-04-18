import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InventoryService } from '../inventory.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BundleStockService } from '../../../products/services/bundle-stock.service';

describe('InventoryService — reads', () => {
  let service: InventoryService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      inventory: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
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

  describe('list', () => {
    it('returns paged items with summary + derived status', async () => {
      prisma.inventory.findMany.mockResolvedValue([
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
      ]);
      prisma.inventory.count.mockResolvedValue(1);

      const result = await service.list({}, 'c1');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].sku).toBe('SKU-1');
      expect(result.items[0].status).toBe('healthy');
      expect(result.items[0].kind).toBe('SIMPLE');
      expect(result.summary.total).toBe(1);
      expect(result.summary.healthy).toBe(1);
    });

    it('bundle option uses availableStock', async () => {
      prisma.inventory.findMany.mockResolvedValue([
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
      ]);
      prisma.inventory.count.mockResolvedValue(1);

      const result = await service.list({}, 'c1');

      expect(result.items[0].kind).toBe('BUNDLE');
      expect(result.items[0].availableStock).toBe(5);
    });

    it('filters by companyId (IDOR)', async () => {
      prisma.inventory.findMany.mockResolvedValue([]);
      prisma.inventory.count.mockResolvedValue(0);
      await service.list({}, 'c1');
      const call = prisma.inventory.findMany.mock.calls[0][0];
      expect(call.where.companyId).toBe('c1');
    });
  });

  describe('findById', () => {
    it('returns inventory when owned by company', async () => {
      prisma.inventory.findFirst.mockResolvedValue({
        id: 'inv-1', optionId: 'opt-1', companyId: 'c1',
        currentStock: 50, reservedStock: 0, safetyStock: 0, reorderPoint: 0,
        reorderQuantity: 0, leadTimeDays: null, dailySalesAvg: 0,
        warehouseLocation: null, lastRestockedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      });
      const result = await service.findById('inv-1', 'c1');
      expect(result.id).toBe('inv-1');
      expect(prisma.inventory.findFirst).toHaveBeenCalledWith({
        where: { id: 'inv-1', companyId: 'c1' },
      });
    });

    it('throws NotFoundException for wrong company', async () => {
      prisma.inventory.findFirst.mockResolvedValue(null);
      await expect(service.findById('inv-1', 'c2')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByOptionId', () => {
    it('lookup by option id with company guard', async () => {
      prisma.inventory.findFirst.mockResolvedValue({
        id: 'inv-1', optionId: 'opt-1', companyId: 'c1',
        currentStock: 50, reservedStock: 0, safetyStock: 0, reorderPoint: 0,
        reorderQuantity: 0, leadTimeDays: null, dailySalesAvg: 0,
        warehouseLocation: null, lastRestockedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      });
      const result = await service.findByOptionId('opt-1', 'c1');
      expect(result.optionId).toBe('opt-1');
      expect(prisma.inventory.findFirst).toHaveBeenCalledWith({
        where: { optionId: 'opt-1', companyId: 'c1' },
      });
    });
  });
});
