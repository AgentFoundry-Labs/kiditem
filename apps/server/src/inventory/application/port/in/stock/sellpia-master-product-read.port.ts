export const SELLPIA_MASTER_PRODUCT_READ_PORT = Symbol(
  'SELLPIA_MASTER_PRODUCT_READ_PORT',
);

export type SellpiaMasterProductReadModel = {
  id: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number;
  purchasePrice: number | null;
  salePrice: number | null;
  isActive: boolean;
  lastImportRunId: string | null;
};

export interface SellpiaMasterProductReadPort {
  findByIds(
    organizationId: string,
    ids: string[],
  ): Promise<SellpiaMasterProductReadModel[]>;
  findByCodes(
    organizationId: string,
    codes: string[],
  ): Promise<SellpiaMasterProductReadModel[]>;
  findByBarcodes(
    organizationId: string,
    barcodes: string[],
  ): Promise<SellpiaMasterProductReadModel[]>;
  findByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<SellpiaMasterProductReadModel[]>;
  search(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<SellpiaMasterProductReadModel[]>;
}
