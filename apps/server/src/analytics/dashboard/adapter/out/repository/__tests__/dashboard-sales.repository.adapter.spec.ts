import { describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  type ProductAbcEvaluation,
} from '@kiditem/shared/product-abc';
import { DashboardSalesRepositoryAdapter } from '../dashboard-sales.repository.adapter';

/**
 * The ranking settles profit through `buildPerListingProfit`, which reads
 * orders and the advertising ledger. These cases assert the SQL's own
 * mapping, so the fake answers the ranking query with the rows and every
 * other read with nothing; no Coupang account exists, so advertising is not
 * an input and the cases stay about the grade and the ranking.
 */
const prismaWith = (topProductRows: unknown[]) => ({
  $queryRaw: vi.fn().mockImplementation(async (sql: { strings?: string[] }) =>
    (sql.strings ?? []).join('').includes('channel_ad_target_daily_snapshots') ? [] : topProductRows),
  order: { findMany: vi.fn().mockResolvedValue([]) },
  channelAccount: { findFirst: vi.fn().mockResolvedValue(null) },
}) as never;

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
    const repository = new DashboardSalesRepositoryAdapter(
      prismaWith([{
        id: 'listing-1', listingId: 'listing-1', name: '상품', organization: '쿠팡',
        abcEvaluation: published, revenue: 10_000, quantity: 1,
      }]),
    );

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
      const repository = new DashboardSalesRepositoryAdapter(
        prismaWith([{
          id: 'listing-1', listingId: 'listing-1', name: '신상품', organization: '쿠팡',
          abcEvaluation, revenue: 10_000, quantity: 1,
        }]),
    );

      const result = await repository.fetchTopProducts(
        '11111111-1111-4111-8111-111111111111',
        new Date('2026-07-01T00:00:00.000Z'),
        new Date('2026-08-01T00:00:00.000Z'),
      );

      expect(result[0]).toMatchObject({ grade: null, abcEvaluation: null, revenue: 10_000 });
    },
  );

  /**
   * The ranking used to publish `revenue * 0.3`. It read as a settled figure,
   * and once Rocket purchase-order lines joined the ranking — they carry no
   * listing to settle against at all — an assumed margin and a measured one
   * were the same pixels. Revenue stays; profit is withheld until measured.
   */
  describe('profit', () => {
    const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
    const JULY = [new Date('2026-07-01T00:00:00.000Z'), new Date('2026-08-01T00:00:00.000Z')] as const;

    it('withholds profit for a line that settles against no listing', async () => {
      const repository = new DashboardSalesRepositoryAdapter(
        prismaWith([{
          id: 'line-sku:53889600', listingId: null, name: '로켓 공급 상품',
          organization: 'Coupang Rocket', abcEvaluation: null, revenue: 1_474_200, quantity: 12,
        }]),
    );

      const [row] = await repository.fetchTopProducts(ORGANIZATION_ID, ...JULY);

      expect(row.revenue).toBe(1_474_200);
      expect(row.netProfit).toBeNull();
      expect(row.profitRate).toBeNull();
      expect(row.netProfit).not.toBe(Math.round(1_474_200 * 0.3));
    });

    it('does not read per-listing profit when no ranked row could consume it', async () => {
      const prisma = prismaWith([{
        id: 'line-sku:1', listingId: null, name: '로켓 공급 상품',
        organization: 'Coupang Rocket', abcEvaluation: null, revenue: 1_000, quantity: 1,
      }]);
      const repository = new DashboardSalesRepositoryAdapter(prisma);

      await repository.fetchTopProducts(ORGANIZATION_ID, ...JULY);

      expect((prisma as unknown as { order: { findMany: { mock: { calls: unknown[] } } } })
        .order.findMany.mock.calls).toHaveLength(0);
    });

    it('publishes the measured figure when the shared helper settled one', async () => {
      const prisma = prismaWith([{
        id: 'listing-1', listingId: 'listing-1', name: '상품',
        organization: '쿠팡', abcEvaluation: null, revenue: 10_000, quantity: 1,
      }]);
      const repository = new DashboardSalesRepositoryAdapter(prisma);
      const settled = vi.spyOn(
        repository as unknown as {
          readProfitByRankedListing: (o: string, f: Date, t: Date) => Promise<Map<string, unknown>>;
        },
        'readProfitByRankedListing',
      ).mockResolvedValue(new Map([['listing-1', { netProfit: 1_234, profitRate: 12.3 }]]));

      const [row] = await repository.fetchTopProducts(ORGANIZATION_ID, ...JULY);

      expect(settled).toHaveBeenCalledOnce();
      expect(row.netProfit).toBe(1_234);
      expect(row.profitRate).toBe(12.3);
    });

    it('withholds profit for a ranked listing the helper had no answer for', async () => {
      const repository = new DashboardSalesRepositoryAdapter(
        prismaWith([{
          id: 'listing-1', listingId: 'listing-1', name: '상품',
          organization: '쿠팡', abcEvaluation: null, revenue: 10_000, quantity: 1,
        }]),
    );

      const [row] = await repository.fetchTopProducts(ORGANIZATION_ID, ...JULY);

      expect(row.revenue).toBe(10_000);
      expect(row.netProfit).toBeNull();
      expect(row.profitRate).toBeNull();
    });
  });
});
