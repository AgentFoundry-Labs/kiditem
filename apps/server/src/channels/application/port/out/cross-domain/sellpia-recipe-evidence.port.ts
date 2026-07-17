export const SELLPIA_RECIPE_EVIDENCE_PORT = Symbol('SELLPIA_RECIPE_EVIDENCE_PORT');

export type SellpiaRecipeEvidenceSku = {
  sellpiaInventorySkuId: string;
  code: string;
  name: string;
  optionName: string | null;
  currentStock: number;
};

export interface SellpiaRecipeEvidencePort {
  findByCodes(organizationId: string, codes: string[]): Promise<SellpiaRecipeEvidenceSku[]>;
  findByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<SellpiaRecipeEvidenceSku[]>;
}
