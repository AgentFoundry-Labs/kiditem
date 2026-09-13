import type {
  InventorySkuSnapshotListResponse,
  InventorySkuSnapshotItem,
  InventorySkuStockStatus,
  SellpiaInventorySkuActiveStatus,
  SellpiaInventorySkuLinkStatus,
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
  activeStatus?: SellpiaInventorySkuActiveStatus;
  linkStatus?: SellpiaInventorySkuLinkStatus;
};

export type InventorySkuSnapshotFilters = Pick<
  InventorySkuSnapshotListQuery,
  'query' | 'stockStatus' | 'activeStatus' | 'linkStatus'
>;

export type SellpiaImportRunListQuery = {
  page?: number;
  limit?: number;
};

export interface InventorySkuSnapshotListPort {
  listSnapshot(
    organizationId: string,
    query: InventorySkuSnapshotListQuery,
  ): Promise<InventorySkuSnapshotListResponse>;

  getSnapshot(
    organizationId: string,
    sellpiaInventorySkuId: string,
  ): Promise<InventorySkuSnapshotItem>;

  listImportRuns(
    organizationId: string,
    query: SellpiaImportRunListQuery,
  ): Promise<SellpiaImportRunListResponse>;
}

/**
 * Export-only read capability. The implementation returns every matching row
 * from one repeatable-read repository transaction so a workbook cannot mix
 * generations during paged reads.
 */
export interface InventorySkuSnapshotExportReader {
  listSnapshotForExport(
    organizationId: string,
    query: InventorySkuSnapshotFilters,
  ): Promise<InventorySkuSnapshotListResponse>;
}
