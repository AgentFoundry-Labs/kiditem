import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';
import type { InventoryAvailabilityCandidate } from '../../in/stock/inventory-availability.port';

export interface InventoryAvailabilityRepositoryPort {
  findAvailability(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<InventoryAvailabilityBatch>;
  searchAvailabilityCandidates(input: {
    organizationId: string;
    query: string;
    limit: number;
    stockStatus: 'in_stock' | 'all';
  }): Promise<InventoryAvailabilityCandidate[]>;
}

export const INVENTORY_AVAILABILITY_REPOSITORY_PORT = Symbol(
  'INVENTORY_AVAILABILITY_REPOSITORY_PORT',
);
