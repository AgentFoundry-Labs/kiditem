import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatisticsService } from '../statistics.service';

/**
 * Plan B2c.orders T3 — overview + products listing-primary 전환 검증.
 * 기타 5 methods (categories/delivery/grades/pareto/repurchase) 테스트는 T4-T6 에서 추가.
 */

function makePrisma() {
  return {
    profitLoss: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    masterProduct: {
      count: vi.fn(),
    },
  };
}

describe('StatisticsService', () => {
  let service: StatisticsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new StatisticsService(prisma as any);
  });

  describe('overview', () => {
    it('returns totalProducts from masterProduct.count (isDeleted:false scope) and aggregates ProfitLoss sums', async () => {
      prisma.profitLoss.aggregate.mockResolvedValue({
        _sum: { revenue: 1_000_000, netProfit: 200_000, orderCount: 40 },
      });
      prisma.masterProduct.count.mockResolvedValue(12);

      const result = await service.overview('company-1', '2026-04');

      // MasterProduct.count called with companyId + isDeleted:false (family 단위)
      expect(prisma.masterProduct.count).toHaveBeenCalledWith({
        where: { companyId: 'company-1', isDeleted: false },
      });
      // ProfitLoss.aggregate scoped with companyId + period (year/month)
      expect(prisma.profitLoss.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'company-1', year: 2026, month: 4 },
        }),
      );

      expect(result).toEqual({
        totalRevenue: 1_000_000,
        totalOrders: 40,
        totalProfit: 200_000,
        avgMargin: 0.2, // 200_000 / 1_000_000 rounded to 4 decimals
        totalProducts: 12,
      });
    });

    it('handles null aggregate sums with zero defaults and zero avgMargin', async () => {
      prisma.profitLoss.aggregate.mockResolvedValue({
        _sum: { revenue: null, netProfit: null, orderCount: null },
      });
      prisma.masterProduct.count.mockResolvedValue(0);

      const result = await service.overview('company-1');

      expect(result).toEqual({
        totalRevenue: 0,
        totalOrders: 0,
        totalProfit: 0,
        avgMargin: 0,
        totalProducts: 0,
      });
    });
  });

  describe('products', () => {
    it('maps profitLoss rows to listing-primary response shape (masterId, masterCode, productName via master)', async () => {
      prisma.profitLoss.findMany.mockResolvedValue([
        {
          listingId: 'listing-1',
          revenue: 500_000,
          netProfit: 100_000,
          orderCount: 20,
          listing: {
            id: 'listing-1',
            externalId: 'ext-1',
            channel: 'coupang',
            channelName: '쿠팡 상품명 A',
            isDeleted: false,
            master: {
              id: 'master-1',
              code: 'M0001',
              name: 'Master Product A',
              category: '유아용품',
              abcGrade: 'A',
              thumbnailUrl: 'https://cdn/a.jpg',
            },
          },
        },
        {
          listingId: 'listing-2',
          revenue: 0,
          netProfit: 0,
          orderCount: 0,
          listing: {
            id: 'listing-2',
            externalId: 'ext-2',
            channel: 'coupang',
            channelName: null,
            isDeleted: false,
            master: {
              id: 'master-2',
              code: 'M0002',
              name: 'Master Product B',
              category: null,
              abcGrade: null,
              thumbnailUrl: null,
            },
          },
        },
      ]);

      const result = await service.products('company-1', '2026-04');

      // include.listing + select 프리셋 (LISTING_WITH_MASTER_SELECT_EXTENDED) 사용
      expect(prisma.profitLoss.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'company-1', year: 2026, month: 4 },
          include: expect.objectContaining({
            listing: expect.objectContaining({
              select: expect.objectContaining({
                id: true,
                externalId: true,
                channelName: true,
                master: expect.any(Object),
              }),
            }),
          }),
          orderBy: { revenue: 'desc' },
        }),
      );

      expect(result).toHaveLength(2);

      // 첫 번째: 실데이터 row — 응답 shape 완전성 검증
      expect(result[0]).toEqual({
        listingId: 'listing-1',
        externalId: 'ext-1',
        channelName: '쿠팡 상품명 A',
        masterId: 'master-1',
        masterCode: 'M0001',
        productName: 'Master Product A',
        category: '유아용품',
        grade: 'A',
        thumbnailUrl: 'https://cdn/a.jpg',
        totalRevenue: 500_000,
        netProfit: 100_000,
        orderCount: 20,
        profitRate: 0.2,
        margin: 0.2,
      });

      // 두 번째: revenue=0 일 때 profitRate/margin 0, null 필드 그대로 통과
      expect(result[1]).toEqual({
        listingId: 'listing-2',
        externalId: 'ext-2',
        channelName: null,
        masterId: 'master-2',
        masterCode: 'M0002',
        productName: 'Master Product B',
        category: null,
        grade: null,
        thumbnailUrl: null,
        totalRevenue: 0,
        netProfit: 0,
        orderCount: 0,
        profitRate: 0,
        margin: 0,
      });
    });
  });
});
