import { describe, expect, it, vi } from 'vitest';
import { DashboardSalesRepositoryAdapter } from '../dashboard-sales.repository.adapter';

describe('DashboardSalesRepositoryAdapter', () => {
  it('preserves an unclassified automatic evaluation on Top Products', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        id: 'listing-1',
        name: '미분류 상품',
        organization: '쿠팡',
        grade: null,
        abcCalculationStatus: 'INSUFFICIENT_EVIDENCE',
        abcRawScore: null,
        abcAdjustedScore: null,
        abcReliability: null,
        abcWeightedRevenue: 12_000,
        abcWeightedOrderTimeCogs: 2_000,
        abcWeightedAdSpend: 0,
        abcWeightedContributionProfit: null,
        abcProfitVelocity30: null,
        abcWeightedContributionMargin: null,
        abcLossRecurrence: null,
        abcPaidOrderCount: 4,
        abcObservationDays: 12,
        abcFirstValidPaidSaleAt: new Date('2026-07-20T00:00:00.000Z'),
        abcSourceCoverageStartDate: new Date('2025-06-26T00:00:00.000Z'),
        abcSourceCoverageEndDate: new Date('2026-07-31T00:00:00.000Z'),
        abcSellpiaSourceStatus: 'READY',
        abcSellpiaSourceCapturedAt: new Date('2026-08-01T00:00:00.000Z'),
        abcAdvertisingSourceStatus: 'CONFIRMED_ZERO',
        abcAdvertisingSourceCapturedAt: new Date('2026-08-01T00:00:00.000Z'),
        abcCostComponents: {
          recognizedRevenue: { amount: 12_000, status: 'OBSERVED' },
          orderTimeCogs: { amount: 2_000, status: 'OBSERVED' },
          advertisingSpend: { amount: 0, status: 'CONFIRMED_ZERO' },
          marketplaceCommission: { amount: 0, status: 'NOT_APPLIED' },
          outboundFulfillment: { amount: 0, status: 'NOT_APPLIED' },
          returnLoss: { amount: 0, status: 'NOT_APPLIED' },
          otherVariableCost: { amount: 0, status: 'NOT_APPLIED' },
        },
        abcStatusDetail: '최소 관찰 기준을 아직 충족하지 않았습니다.',
        abcCalculatedAt: new Date('2026-08-01T00:00:00.000Z'),
        abcFormulaJson: null,
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
      calculationStatus: 'INSUFFICIENT_EVIDENCE',
      paidOrderCount: 4,
      observationDays: 12,
    });
  });
});
