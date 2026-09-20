import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';
import type { InventoryAvailabilityCandidate } from '../../../../domain/inventory-item';

/** The candidate `read/inventory-availability.ts` returns. */
export type { InventoryAvailabilityCandidate };

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
