import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';

export type ProductAvailabilityCandidate = Readonly<{
  masterProductId: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number | null;
}>;

export const PRODUCT_AVAILABILITY_PORT = Symbol('PRODUCT_AVAILABILITY_PORT');

export interface ProductAvailabilityPort {
  findByMasterProductIds(input: {
    organizationId: string;
    masterProductIds: string[];
  }): Promise<InventoryAvailabilityBatch>;

  searchCandidates(input: {
    organizationId: string;
    query: string;
    limit: number;
    stockStatus: 'in_stock' | 'all';
  }): Promise<ProductAvailabilityCandidate[]>;
}
