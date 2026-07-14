import { describe, expect, it, vi } from 'vitest';
import { SellpiaReceiptBatchService } from './sellpia-receipt-batch.service';
import type { SellpiaReceiptUploadBatch } from '@kiditem/shared/inventory';
import type { SellpiaReceiptBatchRepositoryPort } from '../port/out/repository/sellpia-receipt-batch.repository.port';

const batch: SellpiaReceiptUploadBatch = {
  id: '00000000-0000-4000-8000-000000000001',
  status: 'template_pending',
  sourceType: 'purchase_order',
  sourceRef: 'PO-1',
  templateVersion: null,
  uploadedAt: null,
  note: null,
  createdAt: new Date('2026-07-11T00:00:00.000Z'),
};

describe('SellpiaReceiptBatchService', () => {
  it('creates a receipt batch through the receipt-only repository', async () => {
    const repository = makeRepository();
    repository.createReceiptBatch.mockResolvedValue(batch);
    const service = new SellpiaReceiptBatchService(repository);

    const result = await service.createReceiptBatch({
      organizationId: 'org-1',
      userId: 'user-1',
      sourceType: 'purchase_order',
      sourceRef: 'PO-1',
    });

    expect(result).toBe(batch);
    expect(repository.createReceiptBatch).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      sourceType: 'purchase_order',
      sourceRef: 'PO-1',
      note: null,
    });
  });

  it('lists only the current organization receipt batches', async () => {
    const repository = makeRepository();
    repository.listReceiptBatches.mockResolvedValue([batch]);
    const service = new SellpiaReceiptBatchService(repository);

    await expect(service.listReceiptBatches('org-1')).resolves.toEqual([batch]);
    expect(repository.listReceiptBatches).toHaveBeenCalledWith('org-1');
  });

  it('marks a tenant-scoped receipt batch uploaded', async () => {
    const repository = makeRepository();
    repository.markReceiptBatchUploaded.mockResolvedValue({
      ...batch,
      status: 'uploaded',
    });
    const service = new SellpiaReceiptBatchService(repository);

    await service.markReceiptBatchUploaded({
      organizationId: 'org-1',
      userId: 'user-1',
      batchId: batch.id,
    });

    expect(repository.markReceiptBatchUploaded).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      batchId: batch.id,
      note: null,
    });
  });

  it('has exactly the three receipt methods and one receipt repository dependency', () => {
    const methods = Object.getOwnPropertyNames(SellpiaReceiptBatchService.prototype)
      .filter((name) => name !== 'constructor');
    expect(methods).toEqual([
      'createReceiptBatch',
      'listReceiptBatches',
      'markReceiptBatchUploaded',
    ]);
    expect(SellpiaReceiptBatchService.length).toBe(1);
  });
});

function makeRepository() {
  return {
    createReceiptBatch:
      vi.fn<SellpiaReceiptBatchRepositoryPort['createReceiptBatch']>(),
    listReceiptBatches:
      vi.fn<SellpiaReceiptBatchRepositoryPort['listReceiptBatches']>(),
    markReceiptBatchUploaded:
      vi.fn<SellpiaReceiptBatchRepositoryPort['markReceiptBatchUploaded']>(),
  };
}
