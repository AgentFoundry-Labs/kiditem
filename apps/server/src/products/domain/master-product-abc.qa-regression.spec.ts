import { describe, expect, it } from 'vitest';
import type { ProductAbcFormulaSummary } from '@kiditem/shared/product-abc';
import { evaluateMasterProductAbc } from './master-product-abc';

const formula: ProductAbcFormulaSummary = {
  formulaKey: 'ABC_V1', version: 1,
  calculationCodeChecksum: 'a'.repeat(64), formulaChecksum: 'b'.repeat(64),
  activatedAt: new Date('2026-08-01T00:00:00.000Z'), halfLifeDays: 90,
  weights: { profit: 0.5, margin: 0.3, persistence: 0.2 }, orderShrinkK: 20, dayShrinkK: 30,
  cutoffs: { cToB: 40, bToA: 70 },
  normalizationKnots: {
    profitVelocity: [{ value: 0, score: 0 }, { value: 100, score: 100 }],
    contributionMargin: [{ value: 0, score: 0 }, { value: 1, score: 100 }],
    lossRecurrence: [{ value: 0, score: 0 }, { value: 1, score: 100 }],
  },
  trainingRange: { from: '2025-07-01', to: '2026-07-01' }, sampleCount: 30, foldCount: 3,
  calibrationMetrics: { meanSpearmanRankCorrelation: 0.5, meanExplainedVariance: 0.2, gradeChurnRate: 0.1 },
};

function evaluate(masterProductId: string) {
  const start = new Date('2026-06-01T00:00:00.000Z');
  const end = new Date('2026-06-30T00:00:00.000Z');
  return evaluateMasterProductAbc({
    formula, calculatedAt: new Date('2026-08-01T00:00:00.000Z'),
    evidence: {
      masterProductId, asOfDate: new Date('2026-07-31T00:00:00.000Z'), firstValidPaidSaleAt: start,
      validPaidOrderDates: [], paidOrderCount: 30, observationDays: 61, eligibilityReached: true,
      sellpiaStatus: 'READY', adStatus: 'READY',
      sellpiaCapturedAt: new Date('2026-08-01T00:00:00.000Z'), advertisingCapturedAt: new Date('2026-08-01T00:00:00.000Z'),
      monthlyFacts: [{
        yearMonth: '2026-06', coverageStartDate: start, coverageEndDate: end, coveredDays: 30,
        coverageMidpointEpochDay: 0, revenue: 1_000, sellpiaInAmount: 200, adSpend: 100,
        contributionProfit: 700, negativeCoveredDays: 0, lossGranularity: 'MONTH_INFERRED',
        sourceProductCodes: [], sourceOptionCodes: [],
        costBreakdown: {
          recognizedRevenue: { amount: 1_000, status: 'OBSERVED' }, orderTimeCogs: { amount: 200, status: 'OBSERVED' },
          advertisingSpend: { amount: 100, status: 'OBSERVED' }, marketplaceCommission: { amount: 0, status: 'NOT_APPLIED' },
          outboundFulfillment: { amount: 0, status: 'NOT_APPLIED' }, returnLoss: { amount: 0, status: 'NOT_APPLIED' },
          otherVariableCost: { amount: 0, status: 'NOT_APPLIED' },
        },
      }],
    },
  });
}

describe('MasterProduct ABC QA regressions', () => {
  // Regression: identical product evidence must not be split by a portfolio tie.
  it('assigns equal evidence the same formula-derived grade without a cumulative portfolio boundary', () => {
    expect(evaluate('master-a')).toMatchObject({ abcGrade: 'A', calculationStatus: 'READY' });
    expect(evaluate('master-b')).toMatchObject({ abcGrade: 'A', calculationStatus: 'READY' });
  });
});
