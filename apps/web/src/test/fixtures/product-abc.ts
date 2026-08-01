import type {
  ProductAbcEvaluation,
  ProductAbcFormulaSummary,
} from '@kiditem/shared/product-abc';

const checksum = 'a'.repeat(64);

export function productAbcFormula(
  overrides: Partial<ProductAbcFormulaSummary> = {},
): ProductAbcFormulaSummary {
  return {
    formulaKey: 'ABC_V1',
    version: 1,
    calculationCodeChecksum: checksum,
    formulaChecksum: checksum,
    activatedAt: '2026-08-01T00:00:00.000Z',
    halfLifeDays: 90,
    weights: { profit: 0.5, margin: 0.3, persistence: 0.2 },
    orderShrinkK: 20,
    dayShrinkK: 30,
    cutoffs: { cToB: 45, bToA: 70 },
    normalizationKnots: {
      profitVelocity: [{ value: 0, score: 0 }, { value: 100_000, score: 100 }],
      contributionMargin: [{ value: 0, score: 0 }, { value: 1, score: 100 }],
      lossRecurrence: [{ value: 0, score: 100 }, { value: 1, score: 0 }],
    },
    trainingRange: { from: '2025-07-01', to: '2026-07-31' },
    sampleCount: 100,
    foldCount: 3,
    calibrationMetrics: {
      meanSpearmanRankCorrelation: 0.7,
      meanExplainedVariance: 0.6,
      gradeChurnRate: 0.1,
    },
    ...overrides,
  };
}

export function productAbcEvaluation(
  overrides: Partial<ProductAbcEvaluation> = {},
): ProductAbcEvaluation {
  return {
    abcGrade: 'A',
    calculationStatus: 'READY',
    rawScore: 80,
    adjustedScore: 75,
    reliability: 0.8,
    weightedRevenue: 200_000,
    weightedOrderTimeCogs: 70_000,
    weightedAdSpend: 10_000,
    weightedContributionProfit: 120_000,
    profitVelocity30: 30_000,
    weightedContributionMargin: 0.6,
    lossRecurrence: 0.05,
    paidOrderCount: 40,
    observationDays: 60,
    firstValidPaidSaleAt: '2026-06-01T00:00:00.000Z',
    formula: productAbcFormula(),
    sourceFreshness: {
      evaluationCutoffDate: '2026-07-31',
      sellpia: {
        status: 'READY',
        coverageStartDate: '2025-06-26',
        coverageEndDate: '2026-07-31',
        capturedAt: '2026-08-01T00:00:00.000Z',
      },
      advertising: {
        status: 'CONFIRMED_ZERO',
        coverageStartDate: '2025-06-26',
        coverageEndDate: '2026-07-31',
        capturedAt: '2026-08-01T00:00:00.000Z',
      },
    },
    costBreakdown: {
      recognizedRevenue: { amount: 200_000, status: 'OBSERVED' },
      orderTimeCogs: { amount: 70_000, status: 'OBSERVED' },
      advertisingSpend: { amount: 10_000, status: 'OBSERVED' },
      marketplaceCommission: { amount: 0, status: 'NOT_APPLIED' },
      outboundFulfillment: { amount: 0, status: 'NOT_APPLIED' },
      returnLoss: { amount: 0, status: 'NOT_APPLIED' },
      otherVariableCost: { amount: 0, status: 'NOT_APPLIED' },
    },
    statusDetail: null,
    calculatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}
