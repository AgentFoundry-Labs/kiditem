import type {
  InventorySkuReadModel,
  InventorySkuReadPort,
} from '../../in/stock/inventory-sku-read.port';

export const INVENTORY_SKU_READ_REPOSITORY_PORT = Symbol(
  'INVENTORY_SKU_READ_REPOSITORY_PORT',
);

export type InventorySkuReadRepositoryPort = InventorySkuReadPort;
export type { InventorySkuReadModel };
