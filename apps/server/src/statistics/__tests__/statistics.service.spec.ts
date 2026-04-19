import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatisticsService } from '../statistics.service';

/**
 * Plan B2c.orders T3 + T4 + T5 + T6 — overview + products (T3) / categories + grades + pareto (T4) / delivery (T5) / repurchase (T6)
 * listing-primary 전환 검증. T6: repurchase master-level grouping via OrderLineItem.
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
    orderLineItem: {
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

  describe('repurchase (T6 — master-level grouping via OrderLineItem)', () => {
    it('aggregates repeatProducts at masterId (family) level and repeatCustomers at receiverName level; excludes null listingOption / null receiverName', async () => {
      // customer-level fixture — 2 receiver, 4 orders
      //  - '홍길동' has 2 orders (repeat customer, totalAmount 30_000, lastOrder 2026-04-15)
      //  - '김철수' has 1 order (not repeat — filtered out of repeatCustomers)
      //  - 1 order with receiverName: null (excluded from receiverMap)
      prisma.order.findMany.mockResolvedValue([
        {
          receiverName: '홍길동',
          totalPrice: 10_000,
          orderedAt: new Date('2026-04-10T00:00:00Z'),
        },
        {
          receiverName: '홍길동',
          totalPrice: 20_000,
          orderedAt: new Date('2026-04-15T00:00:00Z'),
        },
        {
          receiverName: '김철수',
          totalPrice: 5_000,
          orderedAt: new Date('2026-04-12T00:00:00Z'),
        },
        {
          // null receiverName — must NOT be counted in receiverMap (repurchaseRate stays accurate)
          receiverName: null,
          totalPrice: 1_000,
          orderedAt: new Date('2026-04-13T00:00:00Z'),
        },
      ]);

      // master-level fixture via OrderLineItem
      //  - master-A: 2 lineItems across 2 different receivers ('홍길동' + '김철수') → customers.size=2 → repeatProduct
      //  - master-B: 2 lineItems, but both from same receiver '홍길동' → customers.size=1 → NOT repeatProduct
      //  - lineItem with listingOption: null (unmatched) → excluded from masterMap (masterId undefined)
      //  - lineItem with order.receiverName: null → listed in orderCount but NOT in customers set
      prisma.orderLineItem.findMany.mockResolvedValue([
        // master-A, receiver A
        {
          order: { receiverName: '홍길동' },
          listingOption: {
            listing: {
              masterId: 'master-A',
              master: { name: 'Master A', category: '유아용품' },
            },
          },
        },
        // master-A, receiver B → 2 distinct customers → repeatProduct
        {
          order: { receiverName: '김철수' },
          listingOption: {
            listing: {
              masterId: 'master-A',
              master: { name: 'Master A', category: '유아용품' },
            },
          },
        },
        // master-B, receiver A (2x same receiver) → customers.size=1 → NOT repeat
        {
          order: { receiverName: '홍길동' },
          listingOption: {
            listing: {
              masterId: 'master-B',
              master: { name: 'Master B', category: '완구' },
            },
          },
        },
        {
          order: { receiverName: '홍길동' },
          listingOption: {
            listing: {
              masterId: 'master-B',
              master: { name: 'Master B', category: '완구' },
            },
          },
        },
        // listingOption: null — must be skipped (masterId undefined)
        {
          order: { receiverName: '홍길동' },
          listingOption: null,
        },
        // order.receiverName: null — lineItem still counted in orderCount, but NOT added to customers set
        {
          order: { receiverName: null },
          listingOption: {
            listing: {
              masterId: 'master-A',
              master: { name: 'Master A', category: '유아용품' },
            },
          },
        },
      ]);

      const result = await service.repurchase('company-1', '2026-04');

      // Order.findMany: companyId + status filter + KST period (year,month)
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 'company-1',
            status: { notIn: ['cancelled', 'returned'] },
            orderedAt: expect.objectContaining({
              gte: expect.any(Date),
              lt: expect.any(Date),
            }),
          }),
          select: { receiverName: true, totalPrice: true, orderedAt: true },
        }),
      );

      // OrderLineItem.findMany: order scope + listingOptionId not null + master-level select
      expect(prisma.orderLineItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            order: expect.objectContaining({
              companyId: 'company-1',
              status: { notIn: ['cancelled', 'returned'] },
            }),
            listingOptionId: { not: null },
          }),
          select: expect.objectContaining({
            order: { select: { receiverName: true } },
            listingOption: expect.objectContaining({
              select: expect.objectContaining({
                listing: expect.objectContaining({
                  select: expect.objectContaining({
                    masterId: true,
                    master: { select: { name: true, category: true } },
                  }),
                }),
              }),
            }),
          }),
        }),
      );

      // receiverMap: 2 receivers (홍길동 count=2, 김철수 count=1) — null name excluded
      expect(result.totalCustomers).toBe(2);
      expect(result.repeatCount).toBe(1); // 홍길동 only
      expect(result.repurchaseRate).toBe(0.5); // 1/2
      expect(result.totalOrders).toBe(4); // all 4 orders (null receiver included in totalOrders)

      // repeatProducts: master-A only (customers.size ≥ 2). master-B filtered out.
      //   master-A orderCount = 3 (2 valid receivers + 1 null-receiver line)
      expect(result.repeatProducts).toHaveLength(1);
      expect(result.repeatProducts[0]).toEqual({
        masterId: 'master-A',
        productName: 'Master A',
        category: '유아용품',
        orderCount: 3,
      });

      // repeatCustomers: 홍길동 only
      expect(result.repeatCustomers).toHaveLength(1);
      expect(result.repeatCustomers[0]).toEqual({
        name: '홍길동',
        count: 2,
        totalAmount: 30_000,
        lastOrder: new Date('2026-04-15T00:00:00Z'),
      });
    });

    it('returns zero aggregates when no orders or lineItems exist', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.orderLineItem.findMany.mockResolvedValue([]);

      const result = await service.repurchase('company-1');

      expect(result).toEqual({
        totalCustomers: 0,
        repeatCount: 0,
        repurchaseRate: 0,
        totalOrders: 0,
        repeatProducts: [],
        repeatCustomers: [],
      });
    });

    it('omits orderedAt period filter when period is not provided', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.orderLineItem.findMany.mockResolvedValue([]);

      await service.repurchase('company-1');

      // Order.findMany.where must NOT include orderedAt when period is omitted
      const orderCall = prisma.order.findMany.mock.calls[0][0];
      expect(orderCall.where).not.toHaveProperty('orderedAt');
      expect(orderCall.where).toEqual({
        companyId: 'company-1',
        status: { notIn: ['cancelled', 'returned'] },
      });
    });
  });
});
