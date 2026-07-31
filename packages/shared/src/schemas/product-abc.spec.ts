import { describe, expect, it } from 'vitest';

const modulePath = './product-abc.js';

async function contracts() {
  return import(modulePath);
}

describe('master product ABC contracts', () => {
  it('parses the supported policy and nullable grade publication result', async () => {
    const {
      MasterProductAbcPolicySchema,
      MasterProductAbcRecalculationResultSchema,
    } = await contracts();
    const policy = MasterProductAbcPolicySchema.parse({
      metric: 'SALES_QUANTITY',
      periodDays: 90,
      aCumulativeThreshold: 70,
      bCumulativeThreshold: 90,
    });
    expect(policy).toMatchObject({ metric: 'SALES_QUANTITY', periodDays: 90 });
    expect(MasterProductAbcRecalculationResultSchema.parse({
      changedProductCount: 2,
      classifiedProductCount: 1,
      unclassifiedProductCount: 1,
      grades: [{
        masterProductId: '00000000-0000-4000-8000-000000000001',
        abcGrade: null,
        evaluation: null,
      }],
    }).grades[0]?.abcGrade).toBeNull();
  });

  it('rejects unsupported metrics, incomplete-month windows, and invalid thresholds', async () => {
    const { MasterProductAbcPolicySchema } = await contracts();
    expect(() => MasterProductAbcPolicySchema.parse({
      metric: 'DEPLETION_RATE',
      periodDays: 30,
      aCumulativeThreshold: 70,
      bCumulativeThreshold: 90,
    })).toThrow();
    expect(() => MasterProductAbcPolicySchema.parse({
      metric: 'SALES_AMOUNT',
      periodDays: 7,
      aCumulativeThreshold: 70,
      bCumulativeThreshold: 90,
    })).toThrow();
    expect(() => MasterProductAbcPolicySchema.parse({
      metric: 'SALES_AMOUNT',
      periodDays: 30,
      aCumulativeThreshold: 90,
      bCumulativeThreshold: 70,
    })).toThrow();
  });

  it('defaults to the gross-profit lifecycle policy and rejects impossible observation thresholds', async () => {
    const {
      DEFAULT_MASTER_PRODUCT_ABC_POLICY,
      MasterProductAbcPolicySchema,
    } = await contracts();

    expect(MasterProductAbcPolicySchema.parse({
      metric: 'GROSS_PROFIT',
      periodDays: 360,
      aCumulativeThreshold: 70,
      bCumulativeThreshold: 90,
      minProvisionalMonths: 3,
      minClassifiedMonths: 6,
    })).toMatchObject(DEFAULT_MASTER_PRODUCT_ABC_POLICY);
    expect(DEFAULT_MASTER_PRODUCT_ABC_POLICY).toMatchObject({
      metric: 'GROSS_PROFIT', periodDays: 360,
      aCumulativeThreshold: 70, bCumulativeThreshold: 90,
      minProvisionalMonths: 3, minClassifiedMonths: 6,
    });
    expect(() => MasterProductAbcPolicySchema.parse({
      ...DEFAULT_MASTER_PRODUCT_ABC_POLICY,
      minProvisionalMonths: 6,
      minClassifiedMonths: 6,
    })).toThrow();
    expect(() => MasterProductAbcPolicySchema.parse({
      ...DEFAULT_MASTER_PRODUCT_ABC_POLICY,
      minClassifiedMonths: 13,
    })).toThrow();
  });

  it('keeps lifecycle, official grade, provisional grade, and risk evidence distinct', async () => {
    const { MasterProductAbcEvaluationSchema } = await contracts();
    const base = {
      abcGrade: null,
      provisionalGrade: null,
      confidence: 'LOW',
      eligibilityReason: 'ELIGIBLE',
      riskFlags: [],
      observedCompleteMonths: 2,
      observationStartMonth: '2026-05',
      periodMetricValue: 100_000,
      rankingValue: 600_000,
      grossRevenue: 300_000,
      grossCost: 200_000,
      grossProfit: 100_000,
      grossMarginRate: 33.333333,
      contributionRate: null,
      cumulativeContributionRate: null,
      calculatedAt: '2026-07-01T00:00:00.000Z',
      sourceCapturedAt: '2026-06-30T00:00:00.000Z',
    };

    expect(MasterProductAbcEvaluationSchema.parse({
      ...base,
      lifecycleStage: 'NEW',
    }).lifecycleStage).toBe('NEW');
    expect(MasterProductAbcEvaluationSchema.parse({
      ...base,
      lifecycleStage: 'PROVISIONAL',
      provisionalGrade: 'B',
      observedCompleteMonths: 4,
    }).provisionalGrade).toBe('B');
    expect(MasterProductAbcEvaluationSchema.parse({
      ...base,
      lifecycleStage: 'ESTABLISHED',
      confidence: 'MEDIUM',
      abcGrade: 'A',
      observedCompleteMonths: 6,
      contributionRate: 70,
      cumulativeContributionRate: 70,
    }).abcGrade).toBe('A');
    expect(MasterProductAbcEvaluationSchema.parse({
      ...base,
      lifecycleStage: 'ESTABLISHED',
      confidence: 'HIGH',
      observedCompleteMonths: 12,
      grossProfit: -20_000,
      grossMarginRate: -10,
      riskFlags: ['LOSS'],
    }).riskFlags).toEqual(['LOSS']);
    expect(MasterProductAbcEvaluationSchema.parse({
      ...base,
      lifecycleStage: 'ESTABLISHED',
      confidence: 'HIGH',
      observedCompleteMonths: 12,
      eligibilityReason: 'MISSING_COST',
      grossCost: null,
      grossProfit: null,
      grossMarginRate: null,
      periodMetricValue: null,
      rankingValue: null,
    }).eligibilityReason).toBe('MISSING_COST');

    expect(() => MasterProductAbcEvaluationSchema.parse({
      ...base,
      lifecycleStage: 'NEW',
      abcGrade: 'A',
    })).toThrow();
    expect(() => MasterProductAbcEvaluationSchema.parse({
      ...base,
      lifecycleStage: 'ESTABLISHED',
      provisionalGrade: 'A',
      observedCompleteMonths: 6,
    })).toThrow();
  });
});
