import type {
  SellpiaInventorySkuReadModel,
  SellpiaInventorySkuReadPort,
} from '../../in/stock/sellpia-inventory-sku-read.port';

export const SELLPIA_INVENTORY_SKU_READ_REPOSITORY_PORT = Symbol(
  'SELLPIA_INVENTORY_SKU_READ_REPOSITORY_PORT',
);

export type SellpiaInventorySkuReadRepositoryPort = SellpiaInventorySkuReadPort;
export type { SellpiaInventorySkuReadModel };
