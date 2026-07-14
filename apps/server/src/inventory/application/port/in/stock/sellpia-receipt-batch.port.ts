import type {
  SellpiaReceiptBatchCreateInput,
  SellpiaReceiptBatchMarkUploadedInput,
  SellpiaReceiptUploadBatch,
} from '@kiditem/shared/inventory';

export const SELLPIA_RECEIPT_BATCH_PORT = Symbol('SELLPIA_RECEIPT_BATCH_PORT');

export type CreateSellpiaReceiptBatchInput = SellpiaReceiptBatchCreateInput & {
  organizationId: string;
  userId: string;
};

export type MarkSellpiaReceiptBatchUploadedInput =
  SellpiaReceiptBatchMarkUploadedInput & {
    organizationId: string;
    userId: string;
    batchId: string;
  };

export interface SellpiaReceiptBatchPort {
  createReceiptBatch(
    input: CreateSellpiaReceiptBatchInput,
  ): Promise<SellpiaReceiptUploadBatch>;
  listReceiptBatches(organizationId: string): Promise<SellpiaReceiptUploadBatch[]>;
  markReceiptBatchUploaded(
    input: MarkSellpiaReceiptBatchUploadedInput,
  ): Promise<SellpiaReceiptUploadBatch>;
}
