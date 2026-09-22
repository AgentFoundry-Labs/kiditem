import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';
import type { ProductAvailabilityCandidate } from '../../in/product-availability.port';

export interface ProductAvailabilityRepositoryPort {
  findAvailability(input: {
    organizationId: string;
    masterProductIds: string[];
  }): Promise<InventoryAvailabilityBatch>;
  searchAvailabilityCandidates(input: {
    organizationId: string;
    query: string;
    limit: number;
    stockStatus: 'in_stock' | 'all';
  }): Promise<ProductAvailabilityCandidate[]>;
}

export const PRODUCT_AVAILABILITY_REPOSITORY_PORT = Symbol(
  'PRODUCT_AVAILABILITY_REPOSITORY_PORT',
);
