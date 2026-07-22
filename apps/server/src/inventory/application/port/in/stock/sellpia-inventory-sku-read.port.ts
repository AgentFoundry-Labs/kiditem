export const SELLPIA_INVENTORY_SKU_READ_PORT = Symbol(
  'SELLPIA_INVENTORY_SKU_READ_PORT',
);

export type SellpiaInventorySkuReadModel = {
  sellpiaInventorySkuId: string;
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
  /**
   * SKU id별 활성 InventoryCommitment 합계(약정 수량). 없는 SKU 는 결과에서 생략.
   * availableStock = max(currentStock - activeCommitmentQuantity, 0) 계산에 쓴다.
   */
  getActiveCommitmentBySkuIds(
    organizationId: string,
    sellpiaInventorySkuIds: string[],
  ): Promise<Record<string, number>>;
}
