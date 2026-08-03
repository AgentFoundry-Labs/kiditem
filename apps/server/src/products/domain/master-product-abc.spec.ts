import { describe, expect, it } from 'vitest';
import type { ProductAbcFormulaSummary } from '@kiditem/shared/product-abc';
import type { MasterProductProfitabilityEvidence } from '../../finance/application/port/in/master-product-profitability-read.port';
import { evaluateMasterProductAbc } from './master-product-abc';

const calculatedAt = new Date('2026-08-01T00:00:00.000Z');

const formula: ProductAbcFormulaSummary = {
  formulaKey: 'ABC_V1',
  version: 1,
  calculationCodeChecksum: 'a'.repeat(64),
  formulaChecksum: 'b'.repeat(64),
  activatedAt: calculatedAt,
  halfLifeDays: 90,
  weights: { profit: 0.5, margin: 0.3, persistence: 0.2 },
  dayShrinkK: 30,
  cutoffs: { cToB: 50, bToA: 80 },
  normalizationKnots: {
    profitVelocity: [{ value: 0, score: 0 }, { value: 100, score: 100 }],
    contributionMargin: [{ value: 0, score: 0 }, { value: 1, score: 100 }],
    lossRecurrence: [{ value: 0, score: 0 }, { value: 1, score: 100 }],
  },
  trainingRange: { from: '2025-07-01', to: '2026-07-01' },
  sampleCount: 100,
  foldCount: 4,
  calibrationMetrics: {
    meanSpearmanRankCorrelation: 0.7,
    meanExplainedVariance: 0.5,
    gradeChurnRate: 0.1,
  },
};

function evidence(input: Partial<MasterProductProfitabilityEvidence> = {}) {
  const coverageStartDate = new Date('2026-06-01T00:00:00.000Z');
  const coverageEndDate = new Date('2026-06-30T00:00:00.000Z');
  const revenue = 1_000;
  const sellpiaInAmount = 200;
  const adSpend = 100;
  return {
    masterProductId: 'master-1',
    asOfDate: new Date('2026-07-31T00:00:00.000Z'),
    firstValidPaidSaleAt: new Date('2026-06-01T00:00:00.000Z'),
    validPaidOrderDates: [],
    paidOrderCount: 30,
    observationDays: 61,
    eligibilityReached: true,
    sellpiaStatus: 'READY',
    adStatus: 'READY',
    sellpiaCapturedAt: new Date('2026-08-01T00:00:00.000Z'),
    advertisingCapturedAt: new Date('2026-08-01T00:00:00.000Z'),
    advertisingCoverageStartDate: coverageStartDate,
    advertisingCoverageEndDate: coverageEndDate,
    ordersStatus: 'READY',
    ordersCoverageStartDate: coverageStartDate,
    ordersCoverageEndDate: coverageEndDate,
    ordersCapturedAt: new Date('2026-08-01T00:00:00.000Z'),
    orderLinkedLineCount: 30,
    orderUnlinkedLineCount: 0,
    mappingStatus: 'READY',
    mappingInventoryGeneration: '7',
    mappingVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
    monthlyFacts: [{
      yearMonth: '2026-06',
      coverageStartDate,
      coverageEndDate,
      coveredDays: 30,
      coverageMidpointEpochDay: 0,
      revenue,
      sellpiaInAmount,
      adSpend,
      contributionProfit: revenue - sellpiaInAmount - adSpend,
      negativeCoveredDays: 0,
      lossGranularity: 'MONTH_INFERRED',
      sourceProductCodes: ['P-1'],
      sourceOptionCodes: ['O-1'],
      costBreakdown: {
        recognizedRevenue: { amount: revenue, status: 'OBSERVED' },
        orderTimeCogs: { amount: sellpiaInAmount, status: 'OBSERVED' },
        advertisingSpend: { amount: adSpend, status: 'OBSERVED' },
        marketplaceCommission: { amount: 0, status: 'NOT_APPLIED' },
        outboundFulfillment: { amount: 0, status: 'NOT_APPLIED' },
        returnLoss: { amount: 0, status: 'NOT_APPLIED' },
        otherVariableCost: { amount: 0, status: 'NOT_APPLIED' },
      },
    }],
    ...input,
  } satisfies MasterProductProfitabilityEvidence;
}

function evaluate(input: {
  evidence?: MasterProductProfitabilityEvidence;
  formula?: ProductAbcFormulaSummary | null;
  recalculating?: boolean;
  previousNormalEvaluation?: ReturnType<typeof evaluateMasterProductAbc> | null;
} = {}) {
  return evaluateMasterProductAbc({
    evidence: input.evidence ?? evidence(),
    formula: input.formula === undefined ? formula : input.formula,
    calculatedAt,
    recalculating: input.recalculating,
    previousNormalEvaluation: input.previousNormalEvaluation,
  });
}

describe('evaluateMasterProductAbc', () => {
  it('publishes a frozen-formula grade from source evidence without portfolio ranking', () => {
    expect(evaluate()).toMatchObject({
      abcGrade: 'B',
      calculationStatus: 'READY',
      formula,
      weightedContributionProfit: expect.any(Number),
      costBreakdown: {
        marketplaceCommission: { amount: 0, status: 'NOT_APPLIED' },
      },
    });
  });

  it('makes every non-positive weighted contribution a hard C', () => {
    const value = evidence({
      monthlyFacts: [{
        ...evidence().monthlyFacts[0]!,
        contributionProfit: 0,
        sellpiaInAmount: 900,
        costBreakdown: {
          ...evidence().monthlyFacts[0]!.costBreakdown,
          orderTimeCogs: { amount: 900, status: 'OBSERVED' },
        },
      }],
    });
    expect(evaluate({ evidence: value })).toMatchObject({
      abcGrade: 'C',
      calculationStatus: 'READY',
      weightedContributionProfit: 0,
    });
  });

  it('publishes a valid hard C when a zero-revenue period has no contribution', () => {
    const value = evidence({
      monthlyFacts: [{
        ...evidence().monthlyFacts[0]!,
        revenue: 0,
        sellpiaInAmount: 0,
        adSpend: 0,
        contributionProfit: 0,
        costBreakdown: {
          ...evidence().monthlyFacts[0]!.costBreakdown,
          recognizedRevenue: { amount: 0, status: 'OBSERVED' },
          orderTimeCogs: { amount: 0, status: 'OBSERVED' },
          advertisingSpend: { amount: 0, status: 'OBSERVED' },
        },
      }],
    });

    expect(evaluate({ evidence: value })).toMatchObject({
      abcGrade: 'C', calculationStatus: 'READY', rawScore: 0, adjustedScore: 0,
    });
  });

  it('grades from profitability evidence without paid-order evidence', () => {
    const value = evidence({
      firstValidPaidSaleAt: null,
      validPaidOrderDates: [],
      paidOrderCount: 0,
      observationDays: 0,
      eligibilityReached: false,
      ordersStatus: 'MISSING',
      ordersCoverageStartDate: null,
      ordersCoverageEndDate: null,
      ordersCapturedAt: null,
      orderLinkedLineCount: 0,
      orderUnlinkedLineCount: 0,
    });

    expect(evaluate({ evidence: value })).toMatchObject({
      abcGrade: 'B',
      calculationStatus: 'READY',
    });
  });

  it('leaves unmapped and uncalibrated products ungraded', () => {
    expect(evaluate({ evidence: evidence({ sellpiaStatus: 'UNMAPPED' }) })).toMatchObject({
      abcGrade: null,
      calculationStatus: 'SOURCE_UNMAPPED',
    });
    expect(evaluate({ formula: null })).toMatchObject({
      abcGrade: null,
      calculationStatus: 'CALIBRATION_PENDING',
    });
  });

  it('retains the last normal grade when a Sellpia or advertising source becomes stale', () => {
    const prior = evaluate();
    expect(evaluate({
      evidence: evidence({ sellpiaStatus: 'STALE' }),
      previousNormalEvaluation: prior,
    })).toMatchObject({
      abcGrade: 'B',
      calculationStatus: 'SELLPIA_SOURCE_STALE',
    });
    expect(evaluate({
      evidence: evidence({ adStatus: 'STALE' }),
      previousNormalEvaluation: prior,
    })).toMatchObject({
      abcGrade: 'B',
      calculationStatus: 'AD_SOURCE_STALE',
    });
  });

  it('keeps unresolved and unverified identity separate from no-sale evidence', () => {
    expect(evaluate({ evidence: evidence({ mappingStatus: 'AMBIGUOUS' }) })).toMatchObject({
      abcGrade: null,
      calculationStatus: 'SOURCE_UNMAPPED',
      sourceFreshness: { mapping: { status: 'AMBIGUOUS', inventoryGeneration: '7' } },
    });
    expect(evaluate({ evidence: evidence({ mappingStatus: 'STALE' }) })).toMatchObject({
      abcGrade: null,
      calculationStatus: 'SOURCE_UNMAPPED',
      sourceFreshness: { mapping: { status: 'STALE' } },
    });
  });

  it('retains a normal grade while recalculating and reports malformed evidence as a calculation error', () => {
    const prior = evaluate();
    expect(evaluate({ recalculating: true, previousNormalEvaluation: prior })).toMatchObject({
      abcGrade: 'B',
      calculationStatus: 'RECALCULATING',
    });
    expect(evaluate({
      evidence: evidence({
        monthlyFacts: [{ ...evidence().monthlyFacts[0]!, coveredDays: 29 }],
      }),
      previousNormalEvaluation: prior,
    })).toMatchObject({
      abcGrade: 'B',
      calculationStatus: 'CALCULATION_ERROR',
    });
  });
});
