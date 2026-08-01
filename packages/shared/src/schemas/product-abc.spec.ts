import { describe, expect, it } from 'vitest';

const modulePath = './product-abc.js';
const CHECKSUM = 'a'.repeat(64);

async function contracts() {
  return import(modulePath);
}

const formula = {
  formulaKey: 'ABC_V1',
  version: 1,
  calculationCodeChecksum: CHECKSUM,
  formulaChecksum: CHECKSUM,
  activatedAt: '2026-08-01T00:00:00.000Z',
  halfLifeDays: 90,
  weights: { profit: 0.5, margin: 0.3, persistence: 0.2 },
  orderShrinkK: 20,
  dayShrinkK: 30,
  cutoffs: { cToB: 40, bToA: 70 },
  normalizationKnots: {
    profitVelocity: [{ value: 0, score: 0 }, { value: 100_000, score: 100 }],
    contributionMargin: [{ value: -1, score: 0 }, { value: 0.5, score: 100 }],
    lossRecurrence: [{ value: 0, score: 0 }, { value: 1, score: 100 }],
  },
  trainingRange: { from: '2025-07-01', to: '2026-07-31' },
  sampleCount: 48,
  foldCount: 3,
  calibrationMetrics: {
    meanSpearmanRankCorrelation: 0.72,
    meanExplainedVariance: 0.41,
    gradeChurnRate: 0.08,
  },
};

const costBreakdown = {
  recognizedRevenue: { amount: 500_000, status: 'OBSERVED' },
  orderTimeCogs: { amount: 220_000, status: 'OBSERVED' },
  advertisingSpend: { amount: 30_000, status: 'OBSERVED' },
  marketplaceCommission: { amount: 0, status: 'NOT_APPLIED' },
  outboundFulfillment: { amount: 0, status: 'NOT_APPLIED' },
  returnLoss: { amount: 0, status: 'NOT_APPLIED' },
  otherVariableCost: { amount: 0, status: 'NOT_APPLIED' },
};

describe('automatic product profitability ABC contracts', () => {
  it('defines an immutable formula summary without a manual policy mutation', async () => {
    const { ProductAbcFormulaSummarySchema, ProductAbcCalculationStatusSchema } = await contracts();

    expect(ProductAbcFormulaSummarySchema.parse(formula)).toMatchObject({
      formulaKey: 'ABC_V1', version: 1, halfLifeDays: 90,
    });
    expect(ProductAbcCalculationStatusSchema.options).toEqual([
      'READY', 'INSUFFICIENT_EVIDENCE', 'SOURCE_UNMAPPED', 'CALIBRATION_PENDING',
      'RECALCULATING', 'SELLPIA_SOURCE_STALE', 'AD_SOURCE_STALE', 'CALCULATION_ERROR',
    ]);

    const module = await contracts();
    expect(module).not.toHaveProperty('MasterProductAbcPolicySchema');
    expect(module).not.toHaveProperty('UpdateMasterProductAbcPolicySchema');
    expect(module).not.toHaveProperty('MasterProductAbcMetricSchema');
    expect(module).not.toHaveProperty('MasterProductAbcPeriodDaysSchema');
  });

  it('publishes explainable profitability evidence and all seven cost components', async () => {
    const { ProductAbcEvaluationSchema } = await contracts();
    const evaluation = ProductAbcEvaluationSchema.parse({
      abcGrade: 'A',
      calculationStatus: 'READY',
      rawScore: 82.5,
      adjustedScore: 75.2,
      reliability: 0.74,
      weightedRevenue: 500_000,
      weightedOrderTimeCogs: 220_000,
      weightedAdSpend: 30_000,
      weightedContributionProfit: 250_000,
      profitVelocity30: 120_000,
      weightedContributionMargin: 0.5,
      lossRecurrence: 0,
      paidOrderCount: 31,
      observationDays: 61,
      firstValidPaidSaleAt: '2026-06-01T00:00:00.000Z',
      formula,
      sourceFreshness: {
        evaluationCutoffDate: '2026-07-31',
        sellpia: {
          status: 'READY', coverageStartDate: '2025-06-28', coverageEndDate: '2026-07-31', capturedAt: '2026-08-01T00:00:00.000Z',
        },
        advertising: {
          status: 'READY', coverageStartDate: '2025-06-28', coverageEndDate: '2026-07-31', capturedAt: '2026-08-01T00:00:00.000Z',
        },
      },
      costBreakdown,
      statusDetail: null,
      calculatedAt: '2026-08-01T00:00:00.000Z',
    });

    expect(evaluation.costBreakdown.marketplaceCommission).toEqual({ amount: 0, status: 'NOT_APPLIED' });
    expect(evaluation.abcGrade).toBe('A');
    expect(evaluation.formula?.formulaChecksum).toBe(CHECKSUM);
  });

  it('keeps grade absence and stale-grade retention distinct', async () => {
    const { ProductAbcEvaluationSchema } = await contracts();
    const base = {
      abcGrade: null,
      rawScore: null,
      adjustedScore: null,
      reliability: null,
      weightedRevenue: null,
      weightedOrderTimeCogs: null,
      weightedAdSpend: null,
      weightedContributionProfit: null,
      profitVelocity30: null,
      weightedContributionMargin: null,
      lossRecurrence: null,
      paidOrderCount: 3,
      observationDays: 12,
      firstValidPaidSaleAt: '2026-07-20T00:00:00.000Z',
      formula: null,
      sourceFreshness: {
        evaluationCutoffDate: '2026-07-31',
        sellpia: { status: 'READY', coverageStartDate: '2025-06-28', coverageEndDate: '2026-07-31', capturedAt: '2026-08-01T00:00:00.000Z' },
        advertising: { status: 'MISSING', coverageStartDate: null, coverageEndDate: null, capturedAt: null },
      },
      costBreakdown,
      statusDetail: null,
      calculatedAt: '2026-08-01T00:00:00.000Z',
    };

    expect(ProductAbcEvaluationSchema.parse({ ...base, calculationStatus: 'INSUFFICIENT_EVIDENCE' }).abcGrade).toBeNull();
    expect(ProductAbcEvaluationSchema.parse({
      ...base,
      abcGrade: 'B',
      calculationStatus: 'AD_SOURCE_STALE',
      statusDetail: '광고 일별 원천 범위가 완전하지 않습니다.',
    }).abcGrade).toBe('B');
    expect(() => ProductAbcEvaluationSchema.parse({ ...base, abcGrade: 'A', calculationStatus: 'CALIBRATION_PENDING' })).toThrow();
  });

  it('records grade changes with formula and source-cutoff provenance', async () => {
    const { ProductAbcGradeHistorySchema } = await contracts();
    expect(ProductAbcGradeHistorySchema.parse({
      oldGrade: 'B', newGrade: 'A', calculationStatus: 'READY', formulaKey: 'ABC_V1',
      formulaVersion: 1, formulaChecksum: CHECKSUM, adjustedScore: 75.2,
      weightedContributionProfit: 250_000, weightedContributionMargin: 0.5,
      sourceCutoffDate: '2026-07-31', reason: 'AUTOMATIC_PROFITABILITY_EVALUATION',
      calculatedAt: '2026-08-01T00:00:00.000Z',
    }).newGrade).toBe('A');
  });
});
