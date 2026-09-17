import type { InventorySkuSnapshotSummary } from '@kiditem/shared/inventory';
import type {
  InventorySkuSnapshotQuery,
  InventorySkuSnapshotRow,
  SellpiaImportRunRow,
} from '../../../../read/inventory-availability';

export const INVENTORY_SKU_SNAPSHOT_LIST_REPOSITORY_PORT = Symbol(
  'INVENTORY_SKU_SNAPSHOT_LIST_REPOSITORY_PORT',
);

// The snapshot list and import-run shapes `read/inventory-availability.ts` owns.
export type InventorySkuSnapshotRepositoryQuery = InventorySkuSnapshotQuery;
export type InventorySkuSnapshotRepositoryRow = InventorySkuSnapshotRow;
export type SellpiaImportRunRepositoryRow = SellpiaImportRunRow;

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

  getSnapshot(
    organizationId: string,
    sellpiaInventorySkuId: string,
  ): Promise<InventorySkuSnapshotRepositoryRow | null>;

  listImportRuns(
    organizationId: string,
    query: { skip: number; take: number },
  ): Promise<{
    rows: SellpiaImportRunRepositoryRow[];
    total: number;
  }>;
}
