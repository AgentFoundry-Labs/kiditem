import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPerListingMetrics } from '../../common/per-listing-profit';
import { StatisticsService } from '../statistics.service';

vi.mock('../../common/per-listing-profit', () => ({
  buildPerListingMetrics: vi.fn(),
}));

const mockedBuildPerListingMetrics = vi.mocked(buildPerListingMetrics);

function makePrisma() {
  return {
    masterProduct: {
      count: vi.fn(),
    },
    shipment: {
      findMany: vi.fn(),
    },
    order: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    orderLineItem: {
      findMany: vi.fn(),
    },
  };
}

const baseMetric = {
  listingId: 'listing-1',
  externalId: 'ext-1',
  channel: 'coupang',
  channelName: '쿠팡 상품명 A',
  masterId: 'master-1',
  masterCode: 'M0001',
  masterName: 'Master Product A',
  category: '유아용품',
  grade: 'A',
  thumbnailUrl: 'https://cdn/a.jpg',
  revenue: 500_000,
  costOfGoods: 200_000,
  commission: 50_000,
  shippingCost: 10_000,
  adCost: 30_000,
  otherCost: 0,
  netProfit: 210_000,
  profitRate: 42,
  orderCount: 20,
};

describe('StatisticsService', () => {
  let service: StatisticsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new StatisticsService(prisma as any);
    mockedBuildPerListingMetrics.mockReset();
    mockedBuildPerListingMetrics.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('overview', () => {
    it('uses distinct order.count instead of summing per-listing orderCount', async () => {
      mockedBuildPerListingMetrics.mockResolvedValue([
        { ...baseMetric, listingId: 'listing-1', revenue: 100_000, netProfit: 20_000, orderCount: 1 },
        { ...baseMetric, listingId: 'listing-2', masterId: 'master-2', masterCode: 'M0002', masterName: 'Master Product B', revenue: 50_000, netProfit: 10_000, orderCount: 1 },
      ]);
      prisma.masterProduct.count.mockResolvedValue(2);
      prisma.order.count.mockResolvedValue(1);

      const result = await service.overview('company-1', '2026-04');

      expect(mockedBuildPerListingMetrics).toHaveBeenCalledWith(
        prisma as any,
        'company-1',
        new Date('2026-03-31T15:00:00.000Z'),
        new Date('2026-04-30T15:00:00.000Z'),
      );
      expect(prisma.order.count).toHaveBeenCalledWith({
        where: {
          companyId: 'company-1',
          orderedAt: {
            gte: new Date('2026-03-31T15:00:00.000Z'),
            lt: new Date('2026-04-30T15:00:00.000Z'),
          },
          status: { notIn: ['cancelled', 'returned', 'refunded'] },
        },
      });
      expect(result).toEqual({
        totalRevenue: 150_000,
        totalOrders: 1,
        totalProfit: 30_000,
        avgMargin: 0.2,
        totalProducts: 2,
      });
    });

    it('preserves omitted-period all-time semantics with a bounded live window', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-24T00:00:00.000Z'));
      prisma.masterProduct.count.mockResolvedValue(0);
      prisma.order.count.mockResolvedValue(0);

      await service.overview('company-1');

      expect(mockedBuildPerListingMetrics).toHaveBeenCalledWith(
        prisma as any,
        'company-1',
        new Date(0),
        new Date('2026-04-30T15:00:00.000Z'),
      );
      expect(prisma.order.count).toHaveBeenCalledWith({
        where: {
          companyId: 'company-1',
          orderedAt: {
            gte: new Date(0),
            lt: new Date('2026-04-30T15:00:00.000Z'),
          },
          status: { notIn: ['cancelled', 'returned', 'refunded'] },
        },
      });
    });
  });

  describe('products', () => {
    it('maps live metrics to listing-primary rows and keeps ratio semantics', async () => {
      mockedBuildPerListingMetrics.mockResolvedValue([
        { ...baseMetric, listingId: 'listing-1', revenue: 500_000, netProfit: 100_000 },
        {
          ...baseMetric,
          listingId: 'listing-2',
          externalId: 'ext-2',
          channelName: null,
          masterId: 'master-2',
          masterCode: 'M0002',
          masterName: 'Master Product B',
          category: null,
          grade: null,
          thumbnailUrl: null,
          revenue: 0,
          netProfit: 0,
          orderCount: 0,
        },
      ]);

      const result = await service.products('company-1', '2026-04');

      expect(result).toEqual([
        {
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
        },
        {
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
        },
      ]);
    });
  });

  describe('categories', () => {
    it('groups live metrics by category and sorts by revenue desc', async () => {
      mockedBuildPerListingMetrics.mockResolvedValue([
        { ...baseMetric, listingId: 'listing-1', category: '유아용품', revenue: 300_000, netProfit: 60_000, orderCount: 10 },
        { ...baseMetric, listingId: 'listing-2', category: '완구', revenue: 500_000, netProfit: 100_000, orderCount: 15 },
        { ...baseMetric, listingId: 'listing-3', category: '유아용품', revenue: 200_000, netProfit: 50_000, orderCount: 8 },
        { ...baseMetric, listingId: 'listing-4', category: null, revenue: 50_000, netProfit: 10_000, orderCount: 2 },
      ]);

      const result = await service.categories('company-1', '2026-04');
      const byCategory = new Map(result.map((row) => [row.category, row]));

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
      expect(result[result.length - 1].category).toBe('미분류');
    });
  });

  describe('grades', () => {
    it('groups live metrics by grade with adCost sum and productCount', async () => {
      mockedBuildPerListingMetrics.mockResolvedValue([
        { ...baseMetric, listingId: 'listing-1', grade: 'A', revenue: 1_000_000, netProfit: 200_000, adCost: 50_000 },
        { ...baseMetric, listingId: 'listing-2', grade: 'A', revenue: 500_000, netProfit: 80_000, adCost: 30_000 },
        { ...baseMetric, listingId: 'listing-3', grade: 'B', revenue: 200_000, netProfit: 20_000, adCost: 10_000 },
        { ...baseMetric, listingId: 'listing-4', grade: null, revenue: 50_000, netProfit: 5_000, adCost: 0 },
      ]);

      const result = await service.grades('company-1', '2026-04');

      expect(result).toEqual([
        {
          grade: 'A',
          revenue: 1_500_000,
          profit: 280_000,
          count: 2,
          productCount: 2,
          adCost: 80_000,
        },
        {
          grade: 'B',
          revenue: 200_000,
          profit: 20_000,
          count: 1,
          productCount: 1,
          adCost: 10_000,
        },
        {
          grade: 'N/A',
          revenue: 50_000,
          profit: 5_000,
          count: 1,
          productCount: 1,
          adCost: 0,
        },
      ]);
    });
  });

  describe('pareto', () => {
    it('computes rank, cumulativePercent, and suggestedGrade from live metrics', async () => {
      mockedBuildPerListingMetrics.mockResolvedValue([
        { ...baseMetric, listingId: 'listing-1', masterName: 'Product A', grade: 'A', revenue: 700 },
        { ...baseMetric, listingId: 'listing-2', masterName: 'Product B', grade: 'C', revenue: 200 },
        { ...baseMetric, listingId: 'listing-3', masterName: 'Product C', grade: null, revenue: 100 },
      ]);

      const result = await service.pareto('company-1', '2026-04');

      expect(result).toEqual({
        totalRevenue: 1000,
        gradeDistribution: { A: 1, B: 0, C: 1 },
        mismatchCount: 2,
        data: [
          {
            id: 'listing-1',
            rank: 1,
            name: 'Product A',
            currentGrade: 'A',
            suggestedGrade: 'A',
            gradeMatch: true,
            revenue: 700,
            revenuePercent: 70,
            cumulativePercent: 70,
          },
          {
            id: 'listing-2',
            rank: 2,
            name: 'Product B',
            currentGrade: 'C',
            suggestedGrade: 'B',
            gradeMatch: false,
            revenue: 200,
            revenuePercent: 20,
            cumulativePercent: 90,
          },
          {
            id: 'listing-3',
            rank: 3,
            name: 'Product C',
            currentGrade: 'N/A',
            suggestedGrade: 'C',
            gradeMatch: false,
            revenue: 100,
            revenuePercent: 10,
            cumulativePercent: 100,
          },
        ],
      });
    });
  });

  describe('delivery', () => {
    it('aggregates daily qty from Order.lineItems.quantity sum', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-19T00:00:00.000Z'));
      prisma.shipment.findMany.mockResolvedValue([]);
      prisma.order.findMany.mockResolvedValue([
        {
          orderedAt: new Date('2026-04-18T10:00:00.000Z'),
          totalPrice: 10_000,
          lineItems: [{ quantity: 2 }, { quantity: 3 }],
        },
        {
          orderedAt: new Date('2026-04-18T11:00:00.000Z'),
          totalPrice: 5_000,
          lineItems: [{ quantity: 4 }],
        },
      ]);

      const result = await service.delivery('company-1', '2026-04');

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
      expect(result.totalShipments).toBe(0);
      expect(result.avgDeliveryDays).toBe(0);
      expect(result.courierDistribution).toEqual([]);
      expect(result.daily).toHaveLength(30);
      expect(result.daily.find((row) => row.date === '2026-04-18')).toEqual({
        date: '2026-04-18',
        count: 0,
        orders: 2,
        revenue: 15_000,
        qty: 9,
      });
    });
  });

  describe('repurchase', () => {
    it('aggregates repeatProducts at master level and repeatCustomers at receiver level', async () => {
      prisma.order.findMany.mockResolvedValue([
        {
          receiverName: '홍길동',
          totalPrice: 10_000,
          orderedAt: new Date('2026-04-10T00:00:00.000Z'),
        },
        {
          receiverName: '홍길동',
          totalPrice: 20_000,
          orderedAt: new Date('2026-04-15T00:00:00.000Z'),
        },
        {
          receiverName: '김철수',
          totalPrice: 5_000,
          orderedAt: new Date('2026-04-12T00:00:00.000Z'),
        },
        {
          receiverName: null,
          totalPrice: 1_000,
          orderedAt: new Date('2026-04-13T00:00:00.000Z'),
        },
      ]);
      prisma.orderLineItem.findMany.mockResolvedValue([
        {
          order: { receiverName: '홍길동' },
          listingOption: {
            listing: {
              masterId: 'master-A',
              master: { name: 'Master A', category: '유아용품' },
            },
          },
        },
        {
          order: { receiverName: '김철수' },
          listingOption: {
            listing: {
              masterId: 'master-A',
              master: { name: 'Master A', category: '유아용품' },
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
          listingOption: null,
        },
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
      expect(prisma.orderLineItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            order: expect.objectContaining({
              companyId: 'company-1',
              status: { notIn: ['cancelled', 'returned'] },
            }),
            listingOptionId: { not: null },
          }),
        }),
      );
      expect(result).toEqual({
        totalCustomers: 2,
        repeatCount: 1,
        repurchaseRate: 0.5,
        totalOrders: 4,
        repeatProducts: [
          {
            masterId: 'master-A',
            productName: 'Master A',
            category: '유아용품',
            orderCount: 3,
          },
        ],
        repeatCustomers: [
          {
            name: '홍길동',
            count: 2,
            totalAmount: 30_000,
            lastOrder: new Date('2026-04-15T00:00:00.000Z'),
          },
        ],
      });
    });

    it('omits orderedAt period filter when period is not provided', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.orderLineItem.findMany.mockResolvedValue([]);

      await service.repurchase('company-1');

      const orderCall = prisma.order.findMany.mock.calls[0][0];
      expect(orderCall.where).toEqual({
        companyId: 'company-1',
        status: { notIn: ['cancelled', 'returned'] },
      });
    });
  });
});
