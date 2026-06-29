import type {
  SellpiaApprovalInput,
  SellpiaReceiptBatchCreateInput,
  SellpiaReceiptBatchMarkUploadedInput,
  SellpiaReceiptUploadBatch,
  SellpiaReviewNoteInput,
  SellpiaSnapshotImportResponse,
} from '@kiditem/shared/inventory';
import type { ParsedSellpiaWorkbook } from '../../../service/sellpia-workbook.parser';

export const SELLPIA_SYNC_PORT = Symbol('SellpiaSyncPort');

export type ImportSellpiaRowsInput = ParsedSellpiaWorkbook & {
  organizationId: string;
  userId: string;
  fileName: string;
  fileHash: string;
  effectiveExportedAt: Date;
};

export type ApproveSellpiaItemInput = SellpiaApprovalInput & {
  organizationId: string;
  userId: string;
  itemId: string;
};

export type IgnoreSellpiaItemInput = SellpiaReviewNoteInput & {
  organizationId: string;
  userId: string;
  itemId: string;
};

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

export interface SellpiaSyncPort {
  importRows(input: ImportSellpiaRowsInput): Promise<SellpiaSnapshotImportResponse>;
  approveItem(input: ApproveSellpiaItemInput): Promise<void>;
  ignoreItem(input: IgnoreSellpiaItemInput): Promise<void>;
  createReceiptBatch(input: CreateSellpiaReceiptBatchInput): Promise<SellpiaReceiptUploadBatch>;
  listReceiptBatches(organizationId: string): Promise<SellpiaReceiptUploadBatch[]>;
  markReceiptBatchUploaded(
    input: MarkSellpiaReceiptBatchUploadedInput,
  ): Promise<SellpiaReceiptUploadBatch>;
}
