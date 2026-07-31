import { describe, expect, it, vi } from 'vitest';
import { DashboardSalesRepositoryAdapter } from '../dashboard-sales.repository.adapter';

describe('DashboardSalesRepositoryAdapter', () => {
  it('preserves an unclassified stored MasterProduct grade on Top Products', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        id: 'listing-1',
        name: '미분류 상품',
        organization: '쿠팡',
        grade: null,
        abcProvisionalGrade: 'B',
        abcLifecycleStage: 'PROVISIONAL',
        abcConfidence: 'LOW',
        abcEligibilityReason: 'ELIGIBLE',
        abcRiskFlags: ['LIMITED_HISTORY'],
        abcObservedCompleteMonths: 4,
        abcObservationStartMonth: '2026-04',
        abcPeriodMetricValue: '10000.0',
        abcRankingValue: '30000.0',
        abcGrossRevenue: 12_000,
        abcGrossCost: 2_000,
        abcGrossProfit: 10_000,
        abcGrossMarginRate: '83.3333',
        abcContributionRate: '10.0',
        abcCumulativeContributionRate: '10.0',
        abcCalculatedAt: new Date('2026-08-01T00:00:00.000Z'),
        abcSourceCapturedAt: new Date('2026-07-31T00:00:00.000Z'),
        revenue: 10_000,
        quantity: 1,
      },
    ]);
    const repository = new DashboardSalesRepositoryAdapter({
      $queryRaw: queryRaw,
    } as never);

    const result = await repository.fetchTopProducts(
      '11111111-1111-4111-8111-111111111111',
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-08-01T00:00:00.000Z'),
    );

    expect(result[0].grade).toBeNull();
    expect(result[0].abcEvaluation).toMatchObject({
      lifecycleStage: 'PROVISIONAL',
      provisionalGrade: 'B',
      grossProfit: 10_000,
    });
  });
});
