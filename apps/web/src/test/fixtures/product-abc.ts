import {
  PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD,
  type ProductAbcEvaluation,
  type ProductAbcFormulaPayload,
} from '@kiditem/shared/product-abc';

export function productAbcFormula(
  overrides: Partial<ProductAbcFormulaPayload> = {},
): ProductAbcFormulaPayload {
  return {
    ...PRODUCT_ABC_ABSOLUTE_V1_PAYLOAD,
    ...overrides,
  } as ProductAbcFormulaPayload;
}

export function productAbcEvaluation(
  overrides: Partial<ProductAbcEvaluation> = {},
): ProductAbcEvaluation {
  return {
    abcGrade: 'A',
    weightedRevenue: 200_000,
    weightedOrderTimeSupplyCost: 70_000,
    weightedAdvertisingSpend: 10_000,
    weightedOperatingProfit: 120_000,
    operatingProfitVelocity30: 30_000,
    operatingMargin: 0.6,
    lossPersistence: 0.05,
    profitScore: 80,
    marginScore: 80,
    consistencyScore: 90,
    economicScore: 82,
    validObservationDays: 60,
    formula: productAbcFormula(),
    formulaRevision: 2,
    publicationRevision: 4,
    gradeBasisCutoffDate: '2026-07-31',
    sellpiaSourceImportRunId: '11111111-1111-4111-8111-111111111112',
    advertisingSourceImportRunId: '11111111-1111-4111-8111-111111111113',
    sellpiaGeneration: '7',
    advertisingGeneration: '7',
    mappingGeneration: '7',
    calculatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}
