import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';

export interface InventoryAvailabilityRepositoryPort {
  findAvailability(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<InventoryAvailabilityBatch>;
}

export const INVENTORY_AVAILABILITY_REPOSITORY_PORT = Symbol(
  'INVENTORY_AVAILABILITY_REPOSITORY_PORT',
);
