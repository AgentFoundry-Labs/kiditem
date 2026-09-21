export const SELLPIA_RECIPE_EVIDENCE_PORT = Symbol('SELLPIA_RECIPE_EVIDENCE_PORT');

export type SellpiaRecipeEvidenceSku = {
  masterProductId: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  currentStock: number | null;
};

export interface SellpiaRecipeEvidencePort {
  listActiveForMatching(organizationId: string): Promise<SellpiaRecipeEvidenceSku[]>;
  findByIds(organizationId: string, ids: string[]): Promise<SellpiaRecipeEvidenceSku[]>;
  findByCodes(organizationId: string, codes: string[]): Promise<SellpiaRecipeEvidenceSku[]>;
  findByNormalizedBarcodes(
    organizationId: string,
    normalizedBarcodes: string[],
  ): Promise<SellpiaRecipeEvidenceSku[]>;
  findByNormalizedNames(
    organizationId: string,
    normalizedNames: string[],
  ): Promise<SellpiaRecipeEvidenceSku[]>;
}
