export const MASTER_PRODUCT_PROFIT_FACT_READ_PORT = Symbol(
  'MASTER_PRODUCT_PROFIT_FACT_READ_PORT',
);

export type MasterProductMonthlyProfitFact = Readonly<{
  masterProductId: string;
  yearMonth: string;
  coverageStartDate: Date;
  coverageEndDate: Date;
  coveredDays: number;
  revenue: number;
  sellpiaInAmount: number;
  sourceProductCodes: readonly string[];
  sourceOptionCodes: readonly string[];
  capturedAt: Date;
}>;

export type MasterProductProfitFactEvidence = Readonly<{
  masterProductId: string;
  mappingStatus: 'MAPPED' | 'UNMAPPED';
  monthlyFacts: readonly MasterProductMonthlyProfitFact[];
}>;

export type OrphanSellpiaProductProfitFact = Readonly<{
  productCode: string;
  optionCode: string;
  barcode: string | null;
  yearMonth: string;
  reason:
    | 'SOURCE_UNMAPPED'
    | 'AMBIGUOUS_MASTER_PRODUCT'
    | 'LEGACY_COVERAGE_MISSING'
    | 'COVERAGE_MISMATCH';
}>;

export type MasterProductProfitFactSnapshot = Readonly<{
  evidence: readonly MasterProductProfitFactEvidence[];
  orphanFacts: readonly OrphanSellpiaProductProfitFact[];
}>;

/**
 * Analytics owns resolving raw Sellpia product-profit facts to a product recipe.
 * It exposes facts only; Finance assembles costs and Products owns ABC grades.
 */
export interface MasterProductProfitFactReadPort {
  readProfitFacts(input: {
    organizationId: string;
    masterProductIds: readonly string[];
    range: { from: Date; to: Date };
  }): Promise<MasterProductProfitFactSnapshot>;
}
