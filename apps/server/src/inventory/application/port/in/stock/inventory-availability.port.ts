import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';

export type InventoryAvailabilityCandidate = Readonly<{
  sellpiaInventorySkuId: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number | null;
}>;

export interface InventoryAvailabilityPort {
  findBySkuIds(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<InventoryAvailabilityBatch>;
  searchCandidates(input: {
    organizationId: string;
    query: string;
    limit: number;
    stockStatus: 'in_stock' | 'all';
  }): Promise<InventoryAvailabilityCandidate[]>;
}

export const INVENTORY_AVAILABILITY_PORT = Symbol(
  'INVENTORY_AVAILABILITY_PORT',
);
