import type {
  InventorySkuSnapshotSummary,
  InventorySkuStockStatus,
  SellpiaImportRunSummary,
} from '@kiditem/shared/inventory';

export const INVENTORY_SKU_SNAPSHOT_LIST_REPOSITORY_PORT = Symbol(
  'INVENTORY_SKU_SNAPSHOT_LIST_REPOSITORY_PORT',
);

export type InventorySkuSnapshotRepositoryQuery = {
  skip: number;
  take: number;
  query?: string;
  stockStatus: InventorySkuStockStatus;
};

export type InventorySkuSnapshotRepositoryRow = {
  id: string;
  sellpiaProductCode: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number;
  purchasePrice: number | null;
  salePrice: number | null;
  lastImportRunId: string | null;
  lastImportedAt: Date | null;
};

export type SellpiaImportRunRepositoryRow = Omit<
  SellpiaImportRunSummary,
  'importedAt'
> & {
  importedAt: Date | null;
};

export interface InventorySkuSnapshotListRepositoryPort {
  listSnapshot(
    organizationId: string,
    query: InventorySkuSnapshotRepositoryQuery,
  ): Promise<{
    rows: InventorySkuSnapshotRepositoryRow[];
    total: number;
    summary: InventorySkuSnapshotSummary;
    latestImport: SellpiaImportRunRepositoryRow | null;
  }>;

  listImportRuns(
    organizationId: string,
    query: { skip: number; take: number },
  ): Promise<{
    rows: SellpiaImportRunRepositoryRow[];
    total: number;
  }>;
}
