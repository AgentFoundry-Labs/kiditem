import type {
  InventorySkuLinkedChannelOption,
  InventorySkuLinkedProduct,
  InventorySkuStockStatus,
  SellpiaImportRunSummary,
  SellpiaInventorySkuLinkStatus,
} from '@kiditem/shared/inventory';

/**
 * The inventory item is the owner-facing physical SKU identity.  Stock is a
 * snapshot fact on the item; no channel, order, or purchase model is part of
 * this domain value.
 */
export type InventoryItem = {
  sellpiaInventorySkuId: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number | null;
  isActive: boolean;
  masterProductId: string | null;
};

/** Identity-only inventory facts published to matching consumers. */
export type SellpiaInventorySkuReadModel = Omit<InventoryItem, 'currentStock'> & {
  purchasePrice: number | null;
  salePrice: number | null;
};

export type InventoryAvailabilityCandidate = Readonly<{
  sellpiaInventorySkuId: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number | null;
}>;

export type InventorySkuIdentitySelector =
  | { kind: 'all' }
  | { kind: 'ids'; values: string[] }
  | { kind: 'codes'; values: string[] }
  | { kind: 'barcodes'; values: string[] }
  | { kind: 'normalized_barcodes'; values: string[] }
  | { kind: 'normalized_names'; values: string[] }
  | { kind: 'search'; query: string; limit: number };

export type InventorySkuIdentityQuery = {
  organizationId: string;
  selector: InventorySkuIdentitySelector;
};

export type InventoryAvailabilityQuery = {
  organizationId: string;
  sellpiaInventorySkuIds: string[];
};

export type InventoryAvailabilityCandidateQuery = {
  organizationId: string;
  query: string;
  limit: number;
  stockStatus: 'in_stock' | 'all';
};

export type InventoryMatchingCandidate = Readonly<{
  id: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  masterProductId: string | null;
  currentStock: number | null;
}>;

export type InventorySkuSnapshotQuery = {
  skip: number;
  take?: number;
  query?: string;
  stockStatus: InventorySkuStockStatus;
  linkStatus?: SellpiaInventorySkuLinkStatus;
};

export type InventorySkuSnapshotRow = {
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
  linkedChannelOptionCount: number;
  linkedProductCount: number;
  linkedProducts: InventorySkuLinkedProduct[];
  linkedChannelOptions: InventorySkuLinkedChannelOption[];
};

export type SellpiaImportRunRow = Omit<
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

export type InventorySaleAgeMapping = Readonly<{
  listingId: string;
  options: readonly Readonly<{
    components: readonly Readonly<{
      quantity: number;
      masterProductId: string | null;
      masterProductActive: boolean;
    }>[];
  }>[];
}>;
