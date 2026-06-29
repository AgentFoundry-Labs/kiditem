import type { InventoryRow, StockTransactionRow } from './inventory-query.repository.port';
import type { RepositoryTransaction } from '../transaction/repository-transaction';

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

export type StockAndReservedDeltas = {
  stockDelta: number;
  reservedDelta: number;
};

export type RocketLedgerEntry = {
  organizationId: string;
  inventoryId: string;
  optionId: string;
  eventType: string;
  quantity: number;
  reservedDelta: number;
  stockDelta: number;
  overReservationQty: number;
  sourceActionId: string;
  sourceType: string;
  sourceRef: string;
  overrideBy: string | null;
  overrideReason: string | null;
  createdBy: string;
  note: string | null;
};

export interface InventoryRepositoryPort {
  runTransaction<T>(
    op: (tx: RepositoryTransaction) => Promise<T>,
  ): Promise<T>;

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

  ensureInventoryForOption(
    tx: RepositoryTransaction,
    organizationId: string,
    optionId: string,
  ): Promise<InventoryRow>;

  findRocketLedgerBySource(
    organizationId: string,
    sourceActionId: string,
    eventType: string,
  ): Promise<{ id: string } | null>;

  applyStockAndReservedDeltas(
    tx: RepositoryTransaction,
    inventoryId: string,
    deltas: StockAndReservedDeltas,
  ): Promise<InventoryRow>;

  appendRocketLedger(
    tx: RepositoryTransaction,
    entry: RocketLedgerEntry,
  ): Promise<{ id: string }>;
}
