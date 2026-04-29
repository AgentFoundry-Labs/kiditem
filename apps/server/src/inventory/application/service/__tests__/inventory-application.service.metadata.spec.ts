import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { InventoryApplicationService } from '../inventory-application.service';
import type { InventoryQuery } from '../../../adapter/out/prisma/inventory.query';
import type { InventoryPersistence } from '../../../adapter/out/prisma/inventory.persistence';
import type { BundleStockService } from '../../../../products/application/service/bundle-stock.service';

describe('InventoryApplicationService — metadata update', () => {
  let service: InventoryApplicationService;
  let persistence: { updateInventoryMetadata: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    persistence = { updateInventoryMetadata: vi.fn() };
    service = new InventoryApplicationService(
      {} as InventoryQuery,
      persistence as unknown as InventoryPersistence,
      {} as BundleStockService,
    );
  });

  it('passes only allowed fields to persistence — currentStock never set', async () => {
    persistence.updateInventoryMetadata.mockResolvedValue({
      id: 'i1', optionId: 'o1', companyId: 'c1',
      currentStock: 999, reservedStock: 0, safetyStock: 20,
      reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null,
      dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    await service.updateMetadata('i1', { safetyStock: 20 }, 'c1');

    expect(persistence.updateInventoryMetadata).toHaveBeenCalledWith('i1', 'c1', { safetyStock: 20 });
    const call = persistence.updateInventoryMetadata.mock.calls[0];
    expect(call[2]).not.toHaveProperty('currentStock');
    expect(call[2]).not.toHaveProperty('reservedStock');
  });

  it('propagates NotFound from persistence (cross-tenant guard lives there)', async () => {
    persistence.updateInventoryMetadata.mockRejectedValue(new NotFoundException('Inventory not found'));
    await expect(service.updateMetadata('i1', { safetyStock: 20 }, 'c2'))
      .rejects.toThrow(NotFoundException);
  });
});
