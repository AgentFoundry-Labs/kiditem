import type { InventoryRow, StockTransactionRow } from './inventory-query.repository.port';
import type { RepositoryTransaction } from './repository-transaction';

export const INVENTORY_REPOSITORY_PORT = Symbol('InventoryRepositoryPort');

export type InventoryMetadataUpdateData = {
  safetyStock?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  leadTimeDays?: number | null;
  warehouseLocation?: string | null;
};

export type StockLedgerEntry = {
  organizationId: string;
  optionId: string;
  optionName: string | null;
  type: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  warehouseId?: string;
  relatedId?: string;
  relatedType?: string;
  note?: string;
  createdBy: string;
};

export interface InventoryRepositoryPort {
  updateInventoryMetadata(
    id: string,
    organizationId: string,
    data: InventoryMetadataUpdateData,
  ): Promise<InventoryRow>;

  runInventoryStockMutation<T>(
    inventoryId: string,
    organizationId: string,
    op: (tx: RepositoryTransaction, lockedRow: InventoryRow) => Promise<T>,
  ): Promise<T>;

  applyStockDelta(
    tx: RepositoryTransaction,
    id: string,
    delta: number,
    bumpLastRestockedAt: boolean,
    previousLastRestockedAt: Date | null,
  ): Promise<InventoryRow>;

  findOptionNameForLedger(
    tx: RepositoryTransaction,
    optionId: string,
    organizationId: string,
  ): Promise<string | null>;

  appendStockLedger(
    tx: RepositoryTransaction,
    entry: StockLedgerEntry,
  ): Promise<StockTransactionRow>;
}
