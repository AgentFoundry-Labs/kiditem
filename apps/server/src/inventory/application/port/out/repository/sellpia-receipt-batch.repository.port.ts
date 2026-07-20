import type { SellpiaReceiptUploadBatch } from '@kiditem/shared/inventory';

export const SELLPIA_RECEIPT_BATCH_REPOSITORY_PORT = Symbol(
  'SELLPIA_RECEIPT_BATCH_REPOSITORY_PORT',
);

export interface SellpiaReceiptBatchRepositoryPort {
  createReceiptBatch(input: {
    organizationId: string;
    userId: string;
    sourceType: string;
    sourceRef: string;
    note: string | null;
  }): Promise<SellpiaReceiptUploadBatch>;
  listReceiptBatches(organizationId: string): Promise<SellpiaReceiptUploadBatch[]>;
  markReceiptBatchUploaded(input: {
    organizationId: string;
    userId: string;
    batchId: string;
    note: string | null;
  }): Promise<SellpiaReceiptUploadBatch>;
}
