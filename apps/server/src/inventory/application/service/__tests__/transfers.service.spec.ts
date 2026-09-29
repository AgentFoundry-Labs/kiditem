import { InventoryItemNotFoundError } from '../../exception/inventory-operation.error';
import { describe, expect, it, vi } from 'vitest';
import { TransfersService } from '../transfers.service';

describe('TransfersService', () => {
  it('creates a record-only transfer for an organization-owned source product', async () => {
    const created = { id: 'transfer-1', masterProductId: 'sku-1' };
    const repository = {
      findProductForTransfer: vi.fn().mockResolvedValue({
        optionName: '파랑',
      }),
      findWarehouseIdsForTransfer: vi
        .fn()
        .mockResolvedValue(['warehouse-a', 'warehouse-b']),
      createStockTransfer: vi.fn().mockResolvedValue(created),
    };
    const service = new TransfersService(repository as never);

    await expect(service.create('org-1', {
      masterProductId: 'sku-1',
      fromWarehouseId: 'warehouse-a',
      toWarehouseId: 'warehouse-b',
      quantity: 3,
      notes: 'record only',
    })).resolves.toBe(created);

    expect(repository.findProductForTransfer).toHaveBeenCalledWith(
      'sku-1',
      'org-1',
    );
    expect(repository.findWarehouseIdsForTransfer).toHaveBeenCalledWith(
      ['warehouse-a', 'warehouse-b'],
      'org-1',
    );
    expect(repository.createStockTransfer).toHaveBeenCalledWith('org-1', {
      masterProductId: 'sku-1',
      optionName: '파랑',
      fromWarehouseId: 'warehouse-a',
      toWarehouseId: 'warehouse-b',
      quantity: 3,
      notes: 'record only',
    });
  });

  it('rejects a source product outside the organization', async () => {
    const repository = {
      findProductForTransfer: vi.fn().mockResolvedValue(null),
      findWarehouseIdsForTransfer: vi.fn(),
      createStockTransfer: vi.fn(),
    };
    const service = new TransfersService(repository as never);

    await expect(service.create('org-1', {
      masterProductId: 'foreign-sku',
      fromWarehouseId: 'warehouse-a',
      toWarehouseId: 'warehouse-b',
      quantity: 1,
    })).rejects.toBeInstanceOf(InventoryItemNotFoundError);
    expect(repository.createStockTransfer).not.toHaveBeenCalled();
  });

  it('rejects a transfer when either warehouse is outside the organization', async () => {
    const repository = {
      findProductForTransfer: vi.fn().mockResolvedValue({
        optionName: null,
      }),
      findWarehouseIdsForTransfer: vi.fn().mockResolvedValue(['warehouse-a']),
      createStockTransfer: vi.fn(),
    };
    const service = new TransfersService(repository as never);

    await expect(service.create('org-1', {
      masterProductId: 'sku-1',
      fromWarehouseId: 'warehouse-a',
      toWarehouseId: 'foreign-warehouse',
      quantity: 1,
    })).rejects.toBeInstanceOf(InventoryItemNotFoundError);

    expect(repository.findWarehouseIdsForTransfer).toHaveBeenCalledWith(
      ['warehouse-a', 'foreign-warehouse'],
      'org-1',
    );
    expect(repository.createStockTransfer).not.toHaveBeenCalled();
  });
});
