export const INVENTORY_SKU_READ_PORT = Symbol('INVENTORY_SKU_READ_PORT');

export type InventorySkuReadModel = {
  id: string;
  sellpiaProductCode: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  reportedStock: number;
};

export interface InventorySkuReadPort {
  findByIds(organizationId: string, ids: string[]): Promise<InventorySkuReadModel[]>;
  findBySellpiaCodes(
    organizationId: string,
    codes: string[],
  ): Promise<InventorySkuReadModel[]>;
  findByBarcodes(
    organizationId: string,
    barcodes: string[],
  ): Promise<InventorySkuReadModel[]>;
  search(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<InventorySkuReadModel[]>;
}
