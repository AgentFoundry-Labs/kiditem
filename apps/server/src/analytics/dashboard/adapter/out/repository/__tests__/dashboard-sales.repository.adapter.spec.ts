import { describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  type ProductAbcEvaluation,
} from '@kiditem/shared/product-abc';
import { DashboardSalesRepositoryAdapter } from '../dashboard-sales.repository.adapter';

describe('DashboardSalesRepositoryAdapter', () => {
  it('reads the published absolute evaluation without synthesizing another grade', async () => {
    const published: ProductAbcEvaluation = {
      abcGrade: 'B',
      weightedRevenue: 1_000_000,
      weightedOrderTimeSupplyCost: 600_000,
      weightedAdvertisingSpend: 100_000,
      weightedOperatingProfit: 300_000,
      operatingProfitVelocity30: 300_000,
      operatingMargin: 0.3,
      lossPersistence: 0,
      profitScore: 40,
      marginScore: 100,
      consistencyScore: 100,
      economicScore: 70,
      validObservationDays: 30,
      formula: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
      formulaRevision: 1,
      publicationRevision: 2,
      gradeBasisCutoffDate: '2026-06-30',
      saleStartDate: '2026-05-01',
      sellpiaSourceImportRunId: '11111111-1111-4111-8111-111111111111',
      advertisingSourceImportRunId: '22222222-2222-4222-8222-222222222222',
      sellpiaGeneration: '3',
      advertisingGeneration: '4',
      mappingGeneration: '5',
      calculatedAt: '2026-07-01T00:00:00.000Z',
    };
    const repository = new DashboardSalesRepositoryAdapter({
      $queryRaw: vi.fn().mockResolvedValue([{
        id: 'listing-1', name: '상품', organization: '쿠팡',
        abcEvaluation: published, revenue: 10_000, quantity: 1,
      }]),
    } as never);

    const result = await repository.fetchTopProducts(
      '11111111-1111-4111-8111-111111111111',
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-08-01T00:00:00.000Z'),
    );

    expect(result[0]).toMatchObject({
      grade: 'B', abcEvaluation: published, revenue: 10_000,
    });
  });

  it.each([null, { abcGrade: 'A', economicScore: 95 }])(
    'does not expose an official grade without a complete stored evaluation: %j',
    async (abcEvaluation) => {
      const repository = new DashboardSalesRepositoryAdapter({
        $queryRaw: vi.fn().mockResolvedValue([{
          id: 'listing-1', name: '신상품', organization: '쿠팡',
          abcEvaluation, revenue: 10_000, quantity: 1,
        }]),
      } as never);

      const result = await repository.fetchTopProducts(
        '11111111-1111-4111-8111-111111111111',
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-08-01T00:00:00.000Z'),
      );

      expect(result[0]).toMatchObject({ grade: null, abcEvaluation: null, revenue: 10_000 });
    },
  );
});
