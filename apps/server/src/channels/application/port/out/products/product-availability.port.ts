import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';
export const CHANNEL_PRODUCT_AVAILABILITY_PORT = Symbol('CHANNEL_PRODUCT_AVAILABILITY_PORT');
export interface ChannelProductAvailabilityPort {
  findByMasterProductIds(input: { organizationId: string; masterProductIds: string[] }): Promise<InventoryAvailabilityBatch>;
}
