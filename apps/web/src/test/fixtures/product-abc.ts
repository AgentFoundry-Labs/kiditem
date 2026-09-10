import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  type ProductAbcEvaluation,
  type ProductAbcFormulaPayload,
  type ProductAbcReadModel,
} from '@kiditem/shared/product-abc';

export function productAbcFormula(
  overrides: Partial<ProductAbcFormulaPayload> = {},
): ProductAbcFormulaPayload {
  return {
    ...PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
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
    saleStartDate: '2026-06-01',
    ...overrides,
  };
}

export function productAbcReadModel(
  overrides: Partial<ProductAbcReadModel> = {},
): ProductAbcReadModel {
  const evaluation = overrides.evaluation === undefined ? productAbcEvaluation() : overrides.evaluation;
  const source = {
    status: 'READY' as const,
    sourceImportRunId: '11111111-1111-4111-8111-111111111112', generation: '7',
    coverageStartDate: '2026-06-01', coverageEndDate: '2026-07-31', actualCutoffDate: '2026-07-31',
    capturedAt: '2026-08-01T00:00:00.000Z', latestAttemptState: 'COMPLETE' as const, errorCode: null,
  };
  return {
    abcGrade: evaluation?.abcGrade ?? null,
    evaluation,
    displayStatus: evaluation ? 'READY' : 'INSUFFICIENT_EVIDENCE',
    formulaRevision: 2, publicationRevision: 4,
    officialCutoffDate: evaluation?.gradeBasisCutoffDate ?? null,
    publishedAt: '2026-08-01T00:00:00.000Z', actualCutoffDate: '2026-07-31',
    sources: {
      sellpia: source,
      advertising: { ...source, sourceImportRunId: '11111111-1111-4111-8111-111111111113' },
      mapping: { status: 'READY', mappingGeneration: '7' },
    },
    ...overrides,
  };
}
