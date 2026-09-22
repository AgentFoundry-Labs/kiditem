import type {
  InventorySkuLinkedChannelOption,
  InventorySkuLinkedProduct,
  InventorySkuStockStatus,
  SellpiaImportRunSummary,
  SellpiaInventorySkuLinkStatus,
} from '@kiditem/shared/inventory';

export const PRODUCT_SOURCE_SNAPSHOT_PORT = Symbol('PRODUCT_SOURCE_SNAPSHOT_PORT');

export type ProductSourceSnapshotListQuery = {
  page?: number;
  limit?: number;
  query?: string;
  stockStatus?: InventorySkuStockStatus;
  linkStatus?: SellpiaInventorySkuLinkStatus;
};

export type ProductSourceSnapshotFilters = Pick<
  ProductSourceSnapshotListQuery,
  'query' | 'stockStatus' | 'linkStatus'
>;

export type ProductSourceSnapshotSummary = Readonly<{
  totalProducts: number;
  linkedProducts: number;
  unlinkedProducts: number;
  inStockProducts: number;
  outOfStockProducts: number;
  totalUnits: number;
  pricedAssetValue: number;
  unpricedProductCount: number;
}>;

export type ProductSourceSnapshotItem = Readonly<{
  masterProductId: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number;
  purchasePrice: number | null;
  stockValue: number | null;
  lastImportRunId: string | null;
  lastImportedAt: string | null;
  linkedChannelOptionCount: number;
  linkedProductCount: number;
  linkedProducts: InventorySkuLinkedProduct[];
  linkedChannelOptions: InventorySkuLinkedChannelOption[];
}>;

export type ProductSourceSnapshotListResponse = Readonly<{
  items: ProductSourceSnapshotItem[];
  total: number;
  page: number;
  limit: number;
  summary: ProductSourceSnapshotSummary;
  latestImport: SellpiaImportRunSummary | null;
}>;

export type ProductSourceImportRunListQuery = {
  page?: number;
  limit?: number;
};

export type ProductSourceImportRunListResponse = Readonly<{
  items: SellpiaImportRunSummary[];
  total: number;
  page: number;
  limit: number;
}>;

export interface ProductSourceSnapshotPort {
  listSnapshot(
    organizationId: string,
    query: ProductSourceSnapshotListQuery,
  ): Promise<ProductSourceSnapshotListResponse>;

  getSnapshot(
    organizationId: string,
    masterProductId: string,
  ): Promise<ProductSourceSnapshotItem>;

  listImportRuns(
    organizationId: string,
    query: ProductSourceImportRunListQuery,
  ): Promise<ProductSourceImportRunListResponse>;

  listSnapshotForExport(
    organizationId: string,
    query: ProductSourceSnapshotFilters,
  ): Promise<ProductSourceSnapshotListResponse>;
}

export type { SellpiaImportRunSummary };
