import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SellpiaInventoryImportService } from './sellpia-inventory-import.service';
import type { SellpiaInventoryImportResponse } from '@kiditem/shared/source-import';
import type { ImportSellpiaInventoryInput } from '../port/in/stock/sellpia-inventory-import.port';
import type { InventorySkuImportRepositoryPort } from '../port/out/repository/inventory-sku-import.repository.port';

const runId = '00000000-0000-4000-8000-000000000001';
const attemptToken = '00000000-0000-4000-8000-000000000002';
const response: SellpiaInventoryImportResponse = {
  run: {
    id: runId,
    sourceType: 'sellpia_inventory',
    channelAccountId: null,
    fileName: 'sellpia.xlsx',
    fileHash: 'a'.repeat(64),
    status: 'completed',
    rowCount: 1,
    importedAt: '2026-07-11T00:00:00.000Z',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
  },
  duplicate: false,
  changes: {
    createdSkuCount: 1,
    updatedSkuCount: 0,
    zeroedSkuCount: 0,
  },
};

const input: ImportSellpiaInventoryInput = {
  organizationId: '00000000-0000-4000-8000-000000000010',
  userId: '00000000-0000-4000-8000-000000000011',
  fileName: 'sellpia.xlsx',
  fileHash: 'a'.repeat(64),
  headers: ['상품코드', '재고'],
  rows: [
    {
      rowNumber: 2,
      sellpiaProductCode: 'SP-001',
      name: '상품',
      optionName: null,
      barcode: null,
      currentStock: 4,
      purchasePrice: null,
      salePrice: null,
      rawJson: { 상품코드: 'SP-001', 재고: '4' },
    },
  ],
};

describe('SellpiaInventoryImportService', () => {
  it('returns a completed duplicate immediately without replacing the snapshot', async () => {
    const repository = makeRepository();
    repository.claimSellpiaImport.mockResolvedValue({
      kind: 'duplicate',
      response: { ...response, duplicate: true, changes: zeroChanges() },
    });
    const service = new SellpiaInventoryImportService(repository);

    const result = await service.importInventory(input);

    expect(result.duplicate).toBe(true);
    expect(repository.replaceSellpiaSnapshot).not.toHaveBeenCalled();
  });

  it('rejects a currently running claim', async () => {
    const repository = makeRepository();
    repository.claimSellpiaImport.mockResolvedValue({ kind: 'running' });
    const service = new SellpiaInventoryImportService(repository);

    await expect(service.importInventory(input)).rejects.toBeInstanceOf(ConflictException);
    expect(repository.replaceSellpiaSnapshot).not.toHaveBeenCalled();
  });

  it('continues a reclaimed stale run with its same ID and rotated attempt token', async () => {
    const repository = makeRepository();
    repository.claimSellpiaImport.mockResolvedValue({
      kind: 'started',
      runId,
      attemptToken,
    });
    repository.replaceSellpiaSnapshot.mockResolvedValue(response);
    const service = new SellpiaInventoryImportService(repository);

    await service.importInventory(input);

    expect(repository.replaceSellpiaSnapshot).toHaveBeenCalledWith({
      organizationId: input.organizationId,
      runId,
      attemptToken,
      rows: input.rows,
    });
  });

  it('claims with file provenance and replaces a started snapshot exactly once', async () => {
    const repository = makeRepository();
    repository.claimSellpiaImport.mockResolvedValue({
      kind: 'started',
      runId,
      attemptToken,
    });
    repository.replaceSellpiaSnapshot.mockResolvedValue(response);
    const service = new SellpiaInventoryImportService(repository);

    const result = await service.importInventory(input);

    expect(repository.claimSellpiaImport).toHaveBeenCalledWith({
      organizationId: input.organizationId,
      userId: input.userId,
      fileName: input.fileName,
      fileHash: input.fileHash,
      rowCount: 1,
    });
    expect(repository.replaceSellpiaSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toBe(response);
  });

  it('fences failure marking with the same token and preserves the replace error', async () => {
    const replaceError = new Error('upsert failed');
    const repository = makeRepository();
    repository.claimSellpiaImport.mockResolvedValue({
      kind: 'started',
      runId,
      attemptToken,
    });
    repository.replaceSellpiaSnapshot.mockRejectedValue(replaceError);
    repository.markImportFailed.mockRejectedValue(new Error('failure marker lost race'));
    const service = new SellpiaInventoryImportService(repository);

    await expect(service.importInventory(input)).rejects.toBe(replaceError);
    expect(repository.markImportFailed).toHaveBeenCalledTimes(1);
    expect(repository.markImportFailed).toHaveBeenCalledWith(
      input.organizationId,
      runId,
      attemptToken,
    );
  });

  it('injects only the InventorySku import repository', () => {
    expect(SellpiaInventoryImportService.length).toBe(1);
    expect(() => new SellpiaInventoryImportService(makeRepository())).not.toThrow();
  });
});

function zeroChanges(): SellpiaInventoryImportResponse['changes'] {
  return { createdSkuCount: 0, updatedSkuCount: 0, zeroedSkuCount: 0 };
}

function makeRepository() {
  return {
    claimSellpiaImport: vi.fn<InventorySkuImportRepositoryPort['claimSellpiaImport']>(),
    replaceSellpiaSnapshot:
      vi.fn<InventorySkuImportRepositoryPort['replaceSellpiaSnapshot']>(),
    markImportFailed: vi
      .fn<InventorySkuImportRepositoryPort['markImportFailed']>()
      .mockResolvedValue(undefined),
  };
}
