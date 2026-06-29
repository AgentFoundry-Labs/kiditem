import type {
  SellpiaBlockingReason,
  SellpiaReceiptUploadBatch,
  SellpiaSnapshotImportResponse,
  SellpiaSnapshotItemStatus,
  SellpiaWarningReason,
} from '@kiditem/shared/inventory';
import type { RepositoryTransaction } from '../transaction/repository-transaction';

export const SELLPIA_SYNC_REPOSITORY_PORT = Symbol('SellpiaSyncRepositoryPort');

export type SellpiaMatchedOptionRow = {
  productOptionId: string;
  inventoryId: string | null;
  currentStock: number;
};

export type SellpiaSnapshotItemCreate = {
  rowNumber: number;
  sellpiaProductCode: string;
  sellpiaProductName: string | null;
  sellpiaStock: number;
  safetyStock: number;
  ownProductCode: string | null;
  barcode: string | null;
  modelName: string | null;
  productOptionId: string | null;
  inventoryId: string | null;
  rocketLedgerNet: number;
  targetCurrentStock: number;
  kiditemStockBefore: number;
  diff: number;
  diffRate: number;
  status: SellpiaSnapshotItemStatus;
  blockingReasons: SellpiaBlockingReason[];
  warningReasons: SellpiaWarningReason[];
  rawJson: Record<string, unknown>;
  createCandidate: boolean;
};

export type SellpiaSnapshotItemApprovalRow = {
  id: string;
  inventoryId: string | null;
  productOptionId: string | null;
  targetCurrentStock: number;
  kiditemStockBefore: number;
  warningReasons: SellpiaWarningReason[];
  blockingReasons: SellpiaBlockingReason[];
  status: SellpiaSnapshotItemStatus;
};

export type CreateSellpiaSnapshotInput = {
  organizationId: string;
  userId: string;
  fileName: string;
  fileHash: string;
  effectiveExportedAt: Date;
  ignoredColumns: string[];
  headers: string[];
  items: SellpiaSnapshotItemCreate[];
};

export type MarkSellpiaItemAppliedInput = {
  organizationId: string;
  itemId: string;
  operatorTargetStock: number;
  kiditemStockAtApply: number;
  transactionId: string | null;
  userId: string;
  reason: string | null;
  status: Extract<SellpiaSnapshotItemStatus, 'approved_adjusted' | 'manual_adjusted'>;
};

export interface SellpiaSyncRepositoryPort {
  findOptionsBySellpiaCodes(
    organizationId: string,
    sellpiaProductCodes: string[],
  ): Promise<Map<string, SellpiaMatchedOptionRow | null>>;

  sumRocketStockDeltas(
    organizationId: string,
    optionIds: string[],
    until: Date,
  ): Promise<Map<string, number>>;

  listLatestStockEventTimes(
    organizationId: string,
    optionIds: string[],
  ): Promise<Map<string, Date>>;

  createSnapshotWithItems(
    input: CreateSellpiaSnapshotInput,
  ): Promise<SellpiaSnapshotImportResponse>;

  findSnapshotItemForApproval(
    organizationId: string,
    itemId: string,
  ): Promise<SellpiaSnapshotItemApprovalRow | null>;

  lockSnapshotItemForApproval(
    tx: RepositoryTransaction,
    organizationId: string,
    itemId: string,
  ): Promise<SellpiaSnapshotItemApprovalRow | null>;

  markItemApplied(
    tx: RepositoryTransaction,
    input: MarkSellpiaItemAppliedInput,
  ): Promise<void>;

  markItemIgnored(input: {
    organizationId: string;
    itemId: string;
    userId: string;
    reason: string | null;
  }): Promise<void>;

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
