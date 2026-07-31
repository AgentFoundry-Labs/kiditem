import { describe, expect, it } from 'vitest';

const modulePath = './master-product-abc.js';
async function calculator() { return import(modulePath); }

const policy = {
  aCumulativeThreshold: 70,
  bCumulativeThreshold: 90,
  minProvisionalMonths: 3,
  minClassifiedMonths: 6,
};
const timestamps = {
  calculatedAt: new Date('2026-07-24T00:00:00.000Z'),
  sourceCapturedAt: new Date('2026-07-23T00:00:00.000Z'),
};

function evidence(input: Partial<{
  masterProductId: string;
  periodMetricValue: number | null;
  rankingValue: number | null;
  grossRevenue: number | null;
  grossCost: number | null;
  grossProfit: number | null;
  observedCompleteMonths: number;
  observationStartMonth: string | null;
  eligible: boolean;
  eligibilityReason: 'ELIGIBLE' | 'MISSING_COST' | 'INCOMPLETE_MONTHS';
}> = {}) {
  return {
    masterProductId: input.masterProductId ?? 'master-1',
    periodMetricValue: input.periodMetricValue ?? 100,
    rankingValue: input.rankingValue ?? input.periodMetricValue ?? 100,
    grossRevenue: input.grossRevenue ?? 1_000,
    grossCost: input.grossCost ?? 500,
    grossProfit: input.grossProfit ?? 500,
    observedCompleteMonths: input.observedCompleteMonths ?? 12,
    observationStartMonth: input.observationStartMonth ?? '2025-07',
    eligible: input.eligible ?? true,
    eligibilityReason: input.eligibilityReason ?? 'ELIGIBLE',
    riskFlags: [],
  } as const;
}

describe('calculateMasterProductAbcEvaluations', () => {
  it('keeps equal-score established evidence in the same official grade group', async () => {
    const { calculateMasterProductAbcEvaluations } = await calculator();
    const result = calculateMasterProductAbcEvaluations(policy, [
      evidence({ masterProductId: 'master-c', rankingValue: 25 }),
      evidence({ masterProductId: 'master-a', rankingValue: 50 }),
      evidence({ masterProductId: 'master-b', rankingValue: 25 }),
    ], timestamps);

    expect(result.grades).toEqual(new Map([
      ['master-a', 'A'], ['master-b', 'A'], ['master-c', 'A'],
    ]));
  });

  it('uses cumulative thresholds before each established score group', async () => {
    const { calculateMasterProductAbcEvaluations } = await calculator();
    const result = calculateMasterProductAbcEvaluations(policy, [
      evidence({ masterProductId: 'master-c', rankingValue: 10 }),
      evidence({ masterProductId: 'master-a', rankingValue: 70 }),
      evidence({ masterProductId: 'master-b', rankingValue: 20 }),
    ], timestamps);

    expect(result.grades).toEqual(new Map([
      ['master-a', 'A'], ['master-b', 'B'], ['master-c', 'C'],
    ]));
    expect(result.evaluations.get('master-a')).toMatchObject({
      contributionRate: 70,
      cumulativeContributionRate: 70,
    });
  });

  it('uses lifecycle gates and annualizes an established six-to-eleven month product', async () => {
    const { calculateMasterProductAbcEvaluations, annualizeMetric } = await calculator();
    const result = calculateMasterProductAbcEvaluations(policy, [
      evidence({ masterProductId: 'established', periodMetricValue: 60, rankingValue: 60, observedCompleteMonths: 6 }),
      evidence({ masterProductId: 'provisional', periodMetricValue: 40, rankingValue: 40, observedCompleteMonths: 4 }),
      evidence({ masterProductId: 'new', periodMetricValue: 20, rankingValue: 20, observedCompleteMonths: 2 }),
    ], timestamps);

    expect(annualizeMetric(60, 6)).toBe(120);
    expect(result.evaluations.get('established')).toMatchObject({
      lifecycleStage: 'ESTABLISHED', confidence: 'MEDIUM', rankingValue: 120, abcGrade: 'A', provisionalGrade: null,
    });
    expect(result.evaluations.get('provisional')).toMatchObject({
      lifecycleStage: 'PROVISIONAL', confidence: 'LOW', rankingValue: 40, abcGrade: null, provisionalGrade: 'C',
    });
    expect(result.evaluations.get('new')).toMatchObject({
      lifecycleStage: 'NEW', confidence: 'LOW', abcGrade: null, provisionalGrade: null,
    });
  });

  it('does not put loss, zero, or invalid evidence into the official or provisional cohorts', async () => {
    const { calculateMasterProductAbcEvaluations } = await calculator();
    const result = calculateMasterProductAbcEvaluations(policy, [
      evidence({ masterProductId: 'positive', rankingValue: 100 }),
      evidence({ masterProductId: 'zero', rankingValue: 0 }),
      evidence({ masterProductId: 'loss', rankingValue: -50 }),
      evidence({ masterProductId: 'missing-cost', rankingValue: null, eligible: false, eligibilityReason: 'MISSING_COST' }),
    ], timestamps);

    expect(result.grades).toEqual(new Map([
      ['loss', null], ['missing-cost', null], ['positive', 'A'], ['zero', null],
    ]));
    expect(result.evaluations.get('zero')?.riskFlags).toContain('ZERO_VALUE');
    expect(result.evaluations.get('loss')?.riskFlags).toContain('LOSS');
    expect(result.evaluations.get('missing-cost')).toMatchObject({
      abcGrade: null,
      provisionalGrade: null,
      eligibilityReason: 'MISSING_COST',
    });
  });

  it('keeps provisional products ungraded when no established denominator exists', async () => {
    const { calculateMasterProductAbcEvaluations } = await calculator();
    const result = calculateMasterProductAbcEvaluations(policy, [
      evidence({ masterProductId: 'provisional', observedCompleteMonths: 3, rankingValue: 100 }),
    ], timestamps);

    expect(result.evaluations.get('provisional')).toMatchObject({
      abcGrade: null,
      provisionalGrade: null,
    });
  });
});
