export const SELLPIA_RECIPE_EVIDENCE_PORT = Symbol('SELLPIA_RECIPE_EVIDENCE_PORT');

export type SellpiaRecipeEvidenceSku = {
  sellpiaInventorySkuId: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number;
};

export interface SellpiaRecipeEvidencePort {
  listActiveForMatching(organizationId: string): Promise<SellpiaRecipeEvidenceSku[]>;
  findByCodes(organizationId: string, codes: string[]): Promise<SellpiaRecipeEvidenceSku[]>;
  findByNormalizedBarcodes(
    organizationId: string,
    normalizedBarcodes: string[],
  ): Promise<SellpiaRecipeEvidenceSku[]>;
  findByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<SellpiaRecipeEvidenceSku[]>;
  /**
   * SKU id별 활성 약정 합계. availableStock = max(currentStock - activeCommitmentQuantity, 0)
   * 계산에 쓴다(로켓 재고매칭의 공동 할당·가용재고 기준).
   */
  getActiveCommitmentBySkuIds(
    organizationId: string,
    sellpiaInventorySkuIds: string[],
  ): Promise<Record<string, number>>;
}
