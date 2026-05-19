import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { InventoryService } from '../inventory.service';
import type { InventoryQueryRepositoryPort } from '../../port/out/repository/inventory-query.repository.port';
import type { InventoryRepositoryPort } from '../../port/out/repository/inventory.repository.port';
import type { BundleStockPort } from '../../port/out/cross-domain/bundle-stock.port';

describe('InventoryService — metadata update', () => {
  let service: InventoryService;
  let repository: { updateInventoryMetadata: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    repository = { updateInventoryMetadata: vi.fn() };
    service = new InventoryService(
      {} as InventoryQueryRepositoryPort,
      repository as unknown as InventoryRepositoryPort,
      {} as BundleStockPort,
    );
  });

  it('passes only allowed fields to repository — currentStock never set', async () => {
    repository.updateInventoryMetadata.mockResolvedValue({
      id: 'i1', optionId: 'o1', organizationId: 'c1',
      currentStock: 999, reservedStock: 0, safetyStock: 20,
      reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null,
      dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    await service.updateMetadata('i1', { safetyStock: 20 }, 'c1');

    expect(repository.updateInventoryMetadata).toHaveBeenCalledWith('i1', 'c1', { safetyStock: 20 });
    const call = repository.updateInventoryMetadata.mock.calls[0];
    expect(call[2]).not.toHaveProperty('currentStock');
    expect(call[2]).not.toHaveProperty('reservedStock');
  });

  it('propagates NotFound from repository (cross-tenant guard lives there)', async () => {
    repository.updateInventoryMetadata.mockRejectedValue(new NotFoundException('Inventory not found'));
    await expect(service.updateMetadata('i1', { safetyStock: 20 }, 'c2'))
      .rejects.toThrow(NotFoundException);
  });
});
