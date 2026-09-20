import type { InventorySkuSnapshotSummary } from '@kiditem/shared/inventory';
import type {
  InventorySkuSnapshotQuery,
  InventorySkuSnapshotRow,
  SellpiaImportRunRow,
} from '../../../../domain/inventory-item';

export const INVENTORY_SKU_SNAPSHOT_LIST_REPOSITORY_PORT = Symbol(
  'INVENTORY_SKU_SNAPSHOT_LIST_REPOSITORY_PORT',
);

/** The snapshot list and import-run shapes `read/inventory-availability.ts` owns. */
export type { InventorySkuSnapshotQuery, InventorySkuSnapshotRow, SellpiaImportRunRow };

export interface InventorySkuSnapshotListRepositoryPort {
  listSnapshot(
    organizationId: string,
    query: InventorySkuSnapshotQuery,
  ): Promise<{
    rows: InventorySkuSnapshotRow[];
    total: number;
    summary: InventorySkuSnapshotSummary;
    latestImport: SellpiaImportRunRow | null;
  }>;

  getSnapshot(
    organizationId: string,
    sellpiaInventorySkuId: string,
  ): Promise<InventorySkuSnapshotRow | null>;

  listImportRuns(
    organizationId: string,
    query: { skip: number; take: number },
  ): Promise<{
    rows: SellpiaImportRunRow[];
    total: number;
  }>;
}
