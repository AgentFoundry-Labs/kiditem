import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-commitment';

export interface InventoryAvailabilityPort {
  findBySkuIds(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<InventoryAvailabilityBatch>;
}

export const INVENTORY_AVAILABILITY_PORT = Symbol(
  'INVENTORY_AVAILABILITY_PORT',
);
