import type { SellpiaInventorySkuReadModel } from '../../../../domain/inventory-item';

export const SELLPIA_INVENTORY_SKU_READ_PORT = Symbol(
  'SELLPIA_INVENTORY_SKU_READ_PORT',
);

/** The identity `read/inventory-availability.ts` returns. */
export type { SellpiaInventorySkuReadModel };

export interface SellpiaInventorySkuReadPort {
  listActiveForMatching(
    organizationId: string,
  ): Promise<SellpiaInventorySkuReadModel[]>;
  findByIds(
    organizationId: string,
    ids: string[],
  ): Promise<SellpiaInventorySkuReadModel[]>;
  findByCodes(
    organizationId: string,
    codes: string[],
  ): Promise<SellpiaInventorySkuReadModel[]>;
  findByBarcodes(
    organizationId: string,
    barcodes: string[],
  ): Promise<SellpiaInventorySkuReadModel[]>;
  findByNormalizedBarcodes(
    organizationId: string,
    normalizedBarcodes: string[],
  ): Promise<SellpiaInventorySkuReadModel[]>;
  findByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<SellpiaInventorySkuReadModel[]>;
  search(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<SellpiaInventorySkuReadModel[]>;
}
