import type {
  InventorySkuLinkedProduct,
  InventorySkuLinkedVariant,
  InventorySkuSnapshotSummary,
  InventorySkuStockStatus,
  SellpiaInventorySkuActiveStatus,
  SellpiaInventorySkuLinkStatus,
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
  activeStatus: SellpiaInventorySkuActiveStatus;
  linkStatus?: SellpiaInventorySkuLinkStatus;
};

export type InventorySkuSnapshotRepositoryRow = {
  sellpiaInventorySkuId: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number;
  purchasePrice: number | null;
  salePrice: number | null;
  isActive: boolean;
  lastImportRunId: string | null;
  lastImportedAt: Date | null;
  linkedVariantCount: number;
  linkedProductCount: number;
  linkedProducts: InventorySkuLinkedProduct[];
  linkedVariants: InventorySkuLinkedVariant[];
};

export type SellpiaImportRunRepositoryRow = Omit<
  SellpiaImportRunSummary,
  | 'importedAt'
  | 'lastVerifiedAt'
  | 'manualFreshExportConfirmedAt'
  | 'freshnessGeneration'
  | 'createdAt'
  | 'updatedAt'
> & {
  importedAt: Date | null;
  lastVerifiedAt: Date | null;
  manualFreshExportConfirmedAt: Date | null;
  freshnessGeneration: bigint | null;
  createdAt: Date;
  updatedAt: Date;
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
