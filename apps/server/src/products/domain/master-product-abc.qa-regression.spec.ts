import { describe, expect, it } from 'vitest';
import { calculateMasterProductAbcEvaluations } from './master-product-abc';

const policy = {
  aCumulativeThreshold: 70,
  bCumulativeThreshold: 90,
  minProvisionalMonths: 3,
  minClassifiedMonths: 6,
};

function evidence(masterProductId: string, rankingValue: number) {
  return {
    masterProductId,
    periodMetricValue: rankingValue,
    rankingValue,
    grossRevenue: rankingValue,
    grossCost: 0,
    grossProfit: rankingValue,
    observedCompleteMonths: 12,
    observationStartMonth: '2025-07',
    eligible: true,
    eligibilityReason: 'ELIGIBLE' as const,
    riskFlags: [],
  };
}

describe('MasterProduct ABC QA regressions', () => {
  // Regression: ISSUE-001 — tied products repeated the whole group contribution on each row.
  // Found by /qa on 2026-08-01
  // Report: .gstack/qa-reports/qa-report-abc-profit-2026-08-01.md
  it('reports each tied product contribution while preserving the shared cumulative boundary', () => {
    const result = calculateMasterProductAbcEvaluations(
      policy,
      [
        evidence('master-a', 50),
        evidence('master-b', 25),
        evidence('master-c', 25),
      ],
      {
        calculatedAt: new Date('2026-08-01T00:00:00.000Z'),
        sourceCapturedAt: new Date('2026-07-31T00:00:00.000Z'),
      },
    );

    expect(result.evaluations.get('master-b')).toMatchObject({
      abcGrade: 'A',
      contributionRate: 25,
      cumulativeContributionRate: 100,
    });
    expect(result.evaluations.get('master-c')).toMatchObject({
      abcGrade: 'A',
      contributionRate: 25,
      cumulativeContributionRate: 100,
    });
  });
});
