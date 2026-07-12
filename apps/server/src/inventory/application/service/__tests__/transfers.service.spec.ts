import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TransfersService } from '../transfers.service';

describe('TransfersService', () => {
  it('creates a record-only transfer for an organization-owned InventorySku', async () => {
    const created = { id: 'transfer-1', inventorySkuId: 'inventory-sku-1' };
    const repository = {
      findInventorySkuForTransfer: vi.fn().mockResolvedValue({
        optionName: '파랑',
        legacyOptionId: 'option-1',
      }),
      findWarehouseIdsForTransfer: vi
        .fn()
        .mockResolvedValue(['warehouse-a', 'warehouse-b']),
      createStockTransfer: vi.fn().mockResolvedValue(created),
    };
    const service = new TransfersService(repository as never);

    await expect(service.create('org-1', {
      inventorySkuId: 'inventory-sku-1',
      fromWarehouseId: 'warehouse-a',
      toWarehouseId: 'warehouse-b',
      quantity: 3,
      notes: 'record only',
    })).resolves.toBe(created);

    expect(repository.findInventorySkuForTransfer).toHaveBeenCalledWith(
      'inventory-sku-1',
      'org-1',
    );
    expect(repository.findWarehouseIdsForTransfer).toHaveBeenCalledWith(
      ['warehouse-a', 'warehouse-b'],
      'org-1',
    );
    expect(repository.createStockTransfer).toHaveBeenCalledWith('org-1', {
      inventorySkuId: 'inventory-sku-1',
      optionId: 'option-1',
      optionName: '파랑',
      fromWarehouseId: 'warehouse-a',
      toWarehouseId: 'warehouse-b',
      quantity: 3,
      notes: 'record only',
    });
  });

  it('rejects an InventorySku outside the organization', async () => {
    const repository = {
      findInventorySkuForTransfer: vi.fn().mockResolvedValue(null),
      findWarehouseIdsForTransfer: vi.fn(),
      createStockTransfer: vi.fn(),
    };
    const service = new TransfersService(repository as never);

    await expect(service.create('org-1', {
      inventorySkuId: 'foreign-inventory-sku',
      fromWarehouseId: 'warehouse-a',
      toWarehouseId: 'warehouse-b',
      quantity: 1,
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.createStockTransfer).not.toHaveBeenCalled();
  });

  it('rejects a transfer when either warehouse is outside the organization', async () => {
    const repository = {
      findInventorySkuForTransfer: vi.fn().mockResolvedValue({
        optionName: null,
        legacyOptionId: 'option-1',
      }),
      findWarehouseIdsForTransfer: vi.fn().mockResolvedValue(['warehouse-a']),
      createStockTransfer: vi.fn(),
    };
    const service = new TransfersService(repository as never);

    await expect(service.create('org-1', {
      inventorySkuId: 'inventory-sku-1',
      fromWarehouseId: 'warehouse-a',
      toWarehouseId: 'foreign-warehouse',
      quantity: 1,
    })).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.findWarehouseIdsForTransfer).toHaveBeenCalledWith(
      ['warehouse-a', 'foreign-warehouse'],
      'org-1',
    );
    expect(repository.createStockTransfer).not.toHaveBeenCalled();
  });
});
