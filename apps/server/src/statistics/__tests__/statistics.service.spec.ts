import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatisticsService } from '../statistics.service';

/**
 * Plan B2c.orders T3 + T4 + T5 — overview + products (T3) / categories + grades + pareto (T4) / delivery (T5)
 * listing-primary 전환 검증. repurchase 는 T6 scope.
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
    shipment: {
      findMany: vi.fn(),
    },
    order: {
      findMany: vi.fn(),
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

  describe('categories', () => {
    it('groups ProfitLoss rows by listing.master.category and sorts by revenue desc', async () => {
      prisma.profitLoss.findMany.mockResolvedValue([
        {
          revenue: 300_000,
          netProfit: 60_000,
          orderCount: 10,
          listing: { master: { category: '유아용품' } },
        },
        {
          revenue: 500_000,
          netProfit: 100_000,
          orderCount: 15,
          listing: { master: { category: '완구' } },
        },
        {
          revenue: 200_000,
          netProfit: 50_000,
          orderCount: 8,
          listing: { master: { category: '유아용품' } },
        },
        // null category → '미분류' bucket
        {
          revenue: 50_000,
          netProfit: 10_000,
          orderCount: 2,
          listing: { master: { category: null } },
        },
      ]);

      const result = await service.categories('company-1', '2026-04');

      // include.listing.master.category 로 쿼리
      expect(prisma.profitLoss.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'company-1', year: 2026, month: 4 },
          include: {
            listing: { select: { master: { select: { category: true } } } },
          },
        }),
      );

      // 완구(500k) > 유아용품(300k+200k=500k) → 동률이면 Map 삽입 순서는 아님. revenue desc 로 정렬
      // 유아용품 누적 revenue = 500_000, 완구 = 500_000 → tie. sort 는 안정 정렬이라면 Map 삽입 순서대로. 실제:
      // 유아용품 revenue 500_000, orders 18, profit 110_000
      // 완구 revenue 500_000, orders 15, profit 100_000
      // 미분류 revenue 50_000
      expect(result).toHaveLength(3);
      // 동률일 때 정렬은 비결정적이므로 set-level 검증
      const byCategory = new Map(result.map((r) => [r.category, r]));
      expect(byCategory.get('유아용품')).toEqual({
        category: '유아용품',
        name: '유아용품',
        revenue: 500_000,
        orders: 18,
        profit: 110_000,
        count: 18,
      });
      expect(byCategory.get('완구')).toEqual({
        category: '완구',
        name: '완구',
        revenue: 500_000,
        orders: 15,
        profit: 100_000,
        count: 15,
      });
      expect(byCategory.get('미분류')).toEqual({
        category: '미분류',
        name: '미분류',
        revenue: 50_000,
        orders: 2,
        profit: 10_000,
        count: 2,
      });
      // 미분류(50k) 는 반드시 마지막
      expect(result[result.length - 1].category).toBe('미분류');
    });

    it('returns empty array when no ProfitLoss rows exist', async () => {
      prisma.profitLoss.findMany.mockResolvedValue([]);
      const result = await service.categories('company-1');
      expect(result).toEqual([]);
    });
  });

  describe('grades', () => {
    it('groups ProfitLoss rows by listing.master.abcGrade with adCost sum and productCount', async () => {
      prisma.profitLoss.findMany.mockResolvedValue([
        {
          revenue: 1_000_000,
          netProfit: 200_000,
          adCost: 50_000,
          listing: { master: { abcGrade: 'A' } },
        },
        {
          revenue: 500_000,
          netProfit: 80_000,
          adCost: 30_000,
          listing: { master: { abcGrade: 'A' } },
        },
        {
          revenue: 200_000,
          netProfit: 20_000,
          adCost: 10_000,
          listing: { master: { abcGrade: 'B' } },
        },
        // null → 'N/A'
        {
          revenue: 50_000,
          netProfit: 5_000,
          adCost: 0,
          listing: { master: { abcGrade: null } },
        },
      ]);

      const result = await service.grades('company-1', '2026-04');

      expect(prisma.profitLoss.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'company-1', year: 2026, month: 4 },
          include: {
            listing: { select: { master: { select: { abcGrade: true } } } },
          },
        }),
      );

      // 정렬: A(1,500k) > B(200k) > N/A(50k)
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        grade: 'A',
        revenue: 1_500_000,
        profit: 280_000,
        count: 2,
        productCount: 2,
        adCost: 80_000,
      });
      expect(result[1]).toEqual({
        grade: 'B',
        revenue: 200_000,
        profit: 20_000,
        count: 1,
        productCount: 1,
        adCost: 10_000,
      });
      expect(result[2]).toEqual({
        grade: 'N/A',
        revenue: 50_000,
        profit: 5_000,
        count: 1,
        productCount: 1,
        adCost: 0,
      });
    });

    it('returns empty array when no ProfitLoss rows exist', async () => {
      prisma.profitLoss.findMany.mockResolvedValue([]);
      const result = await service.grades('company-1');
      expect(result).toEqual([]);
    });
  });

  describe('pareto', () => {
    it('computes rank/cumulativePercent/suggestedGrade from listing-primary shape (id = listingId, name via master)', async () => {
      // 3 listings with revenues 700 / 200 / 100 → total 1000
      // cumulativePercent: 70 / 90 / 100 → suggested A / B / C
      prisma.profitLoss.findMany.mockResolvedValue([
        {
          listingId: 'listing-1',
          revenue: 700,
          listing: {
            id: 'listing-1',
            master: { id: 'master-1', name: 'Product A', abcGrade: 'A' },
          },
        },
        {
          listingId: 'listing-2',
          revenue: 200,
          listing: {
            id: 'listing-2',
            master: { id: 'master-2', name: 'Product B', abcGrade: 'C' }, // mismatch — suggested B
          },
        },
        {
          listingId: 'listing-3',
          revenue: 100,
          listing: {
            id: 'listing-3',
            master: { id: 'master-3', name: 'Product C', abcGrade: null }, // null → 'N/A' → mismatch
          },
        },
      ]);

      const result = await service.pareto('company-1', '2026-04');

      // include.listing(id + master.{id,name,abcGrade}) + orderBy revenue desc
      expect(prisma.profitLoss.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'company-1', year: 2026, month: 4 },
          include: {
            listing: {
              select: {
                id: true,
                master: { select: { id: true, name: true, abcGrade: true } },
              },
            },
          },
          orderBy: { revenue: 'desc' },
        }),
      );

      expect(result.totalRevenue).toBe(1000);
      // gradeDistribution: A=1, B=0, C=1 (null→N/A 는 포함 안 됨)
      expect(result.gradeDistribution).toEqual({ A: 1, B: 0, C: 1 });

      // 3 rows — row 1: A=A match, row 2: C vs B mismatch, row 3: N/A vs C mismatch → 2 mismatches
      expect(result.mismatchCount).toBe(2);

      expect(result.data).toHaveLength(3);

      // row 1 — listingId primary, name from master
      expect(result.data[0]).toEqual({
        id: 'listing-1',
        rank: 1,
        name: 'Product A',
        currentGrade: 'A',
        suggestedGrade: 'A',
        gradeMatch: true,
        revenue: 700,
        revenuePercent: 70,
        cumulativePercent: 70,
      });

      // row 2 — cumulative 90 → suggestedGrade 'B' (70<cum<=90 → B). current 'C' → mismatch
      expect(result.data[1]).toEqual({
        id: 'listing-2',
        rank: 2,
        name: 'Product B',
        currentGrade: 'C',
        suggestedGrade: 'B',
        gradeMatch: false,
        revenue: 200,
        revenuePercent: 20,
        cumulativePercent: 90,
      });

      // row 3 — cumulative 100 → 'C'. current null → 'N/A' → mismatch
      expect(result.data[2]).toEqual({
        id: 'listing-3',
        rank: 3,
        name: 'Product C',
        currentGrade: 'N/A',
        suggestedGrade: 'C',
        gradeMatch: false,
        revenue: 100,
        revenuePercent: 10,
        cumulativePercent: 100,
      });
    });

    it('handles empty records with zero totals and empty data', async () => {
      prisma.profitLoss.findMany.mockResolvedValue([]);
      const result = await service.pareto('company-1');
      expect(result).toEqual({
        totalRevenue: 0,
        gradeDistribution: { A: 0, B: 0, C: 0 },
        mismatchCount: 0,
        data: [],
      });
    });
  });

  describe('delivery', () => {
    it('aggregates daily qty from Order.lineItems.quantity sum (multi-line items per order)', async () => {
      // Fix "now" so the 30-day window is deterministic.
      // 2026-04-19 KST — any date within 30 days of this works for the fixture.
      vi.useFakeTimers();
      const fixedNow = new Date('2026-04-19T00:00:00Z');
      vi.setSystemTime(fixedNow);

      try {
        // Shipment findMany called twice: (1) period-scoped for avgDeliveryDays + courierDistribution,
        // (2) 30-day window for dailyMap. Return empty for both → shipment-side aggregates are zero.
        prisma.shipment.findMany.mockResolvedValue([]);

        // 2 orders × 3 line items total. Both on the same day to test qty sum across multiple lineItems.
        // Order 1 on 2026-04-18: 2 lineItems (qty 2 + 3 = 5), revenue 10_000
        // Order 2 on 2026-04-18: 1 lineItem  (qty 4),         revenue  5_000
        // → Daily entry for 2026-04-18: orders=2, revenue=15_000, qty=9
        prisma.order.findMany.mockResolvedValue([
          {
            orderedAt: new Date('2026-04-18T10:00:00Z'),
            totalPrice: 10_000,
            lineItems: [{ quantity: 2 }, { quantity: 3 }],
          },
          {
            orderedAt: new Date('2026-04-18T11:00:00Z'),
            totalPrice: 5_000,
            lineItems: [{ quantity: 4 }],
          },
        ]);

        const result = await service.delivery('company-1', '2026-04');

        // Order.findMany includes lineItems { select: { quantity: true } } (listing-primary aggregate)
        expect(prisma.order.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              companyId: 'company-1',
              status: { notIn: ['cancelled', 'returned'] },
            }),
            select: {
              orderedAt: true,
              totalPrice: true,
              lineItems: { select: { quantity: true } },
            },
          }),
        );

        // Shipment empty → avgDeliveryDays = 0, courierDistribution = []
        expect(result.totalShipments).toBe(0);
        expect(result.avgDeliveryDays).toBe(0);
        expect(result.courierDistribution).toEqual([]);

        // daily is a 30-entry array. Find the entry for 2026-04-18.
        expect(result.daily).toHaveLength(30);
        const apr18 = result.daily.find((d) => d.date === '2026-04-18');
        expect(apr18).toEqual({
          date: '2026-04-18',
          count: 0,
          orders: 2,
          revenue: 15_000,
          qty: 9, // 2 + 3 + 4 from lineItems across both orders
        });

        // Other days have zero orders/revenue/qty (no orders on those days)
        const apr19 = result.daily.find((d) => d.date === '2026-04-19');
        expect(apr19).toEqual({
          date: '2026-04-19',
          count: 0,
          orders: 0,
          revenue: 0,
          qty: 0,
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns zero aggregates when both shipments and orders are empty', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-19T00:00:00Z'));
      try {
        prisma.shipment.findMany.mockResolvedValue([]);
        prisma.order.findMany.mockResolvedValue([]);

        const result = await service.delivery('company-1');

        expect(result.totalShipments).toBe(0);
        expect(result.avgDeliveryDays).toBe(0);
        expect(result.courierDistribution).toEqual([]);
        expect(result.daily).toHaveLength(30);
        // Every day has all zero counts
        for (const entry of result.daily) {
          expect(entry.count).toBe(0);
          expect(entry.orders).toBe(0);
          expect(entry.revenue).toBe(0);
          expect(entry.qty).toBe(0);
        }
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
