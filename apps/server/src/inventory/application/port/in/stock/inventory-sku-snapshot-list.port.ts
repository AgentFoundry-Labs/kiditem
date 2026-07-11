import type {
  InventorySkuSnapshotListResponse,
  InventorySkuStockStatus,
  SellpiaImportRunListResponse,
} from '@kiditem/shared/inventory';

export const INVENTORY_SKU_SNAPSHOT_LIST_PORT = Symbol(
  'INVENTORY_SKU_SNAPSHOT_LIST_PORT',
);

export type InventorySkuSnapshotListQuery = {
  page?: number;
  limit?: number;
  query?: string;
  stockStatus?: InventorySkuStockStatus;
};

export type SellpiaImportRunListQuery = {
  page?: number;
  limit?: number;
};

export interface InventorySkuSnapshotListPort {
  listSnapshot(
    organizationId: string,
    query: InventorySkuSnapshotListQuery,
  ): Promise<InventorySkuSnapshotListResponse>;

  listImportRuns(
    organizationId: string,
    query: SellpiaImportRunListQuery,
  ): Promise<SellpiaImportRunListResponse>;
}
