import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChannelDashboardService } from '../channel-dashboard.service';
import type { PrismaService } from '../../../../prisma/prisma.service';

/**
 * Plan B2c.dashboard T15 — unit tests for the 6 dashboard methods.
 *
 * Focus: shape / calculation / edge cases. PG integration spec covers the
 * real Postgres side (IDOR + KST bucketing + multi-row aggregation).
 */

type PrismaMock = {
  order: {
    aggregate: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  orderReturn: {
    count: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
  channelListing: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  $queryRaw: ReturnType<typeof vi.fn>;
};

function makeMockPrisma(): PrismaMock {
  return {
    order: {
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    orderReturn: {
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    channelListing: {
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn(),
  };
}

const ORGANIZATION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('ChannelDashboardService', () => {
  let prisma: PrismaMock;
  let service: ChannelDashboardService;

  beforeEach(() => {
    prisma = makeMockPrisma();
    service = new ChannelDashboardService(prisma as unknown as PrismaService);
  });

  // -------------------------------------------------------------------------
  // #1 getSummary — today count/revenue + pending + lastModifiedAt naming
  // -------------------------------------------------------------------------
  describe('getSummary', () => {
    it('returns today orders count + revenue + pending accept/returns + lastModifiedAt', async () => {
      prisma.order.aggregate.mockResolvedValueOnce({
        _count: { id: 3 },
        _sum: { totalPrice: 45_000 },
      });
      prisma.order.count.mockResolvedValueOnce(2); // accept_wait
      prisma.orderReturn.count.mockResolvedValueOnce(1); // return_request
      const updatedAt = new Date('2026-04-20T05:00:00.000Z');
      prisma.channelListing.findFirst.mockResolvedValueOnce({ updatedAt });

      const result = await service.getSummary(ORGANIZATION_ID);

      expect(result).toEqual({
        todayOrders: { count: 3, revenue: 45_000 },
        pendingAccept: 2,
        pendingReturns: 1,
        lastModifiedAt: updatedAt,
      });
      // R-07: field must be lastModifiedAt (not lastSyncedAt).
      expect(result).toHaveProperty('lastModifiedAt');
      expect(result).not.toHaveProperty('lastSyncedAt');
    });

    it('revenue=0 when aggregate _sum.totalPrice is null (no orders today)', async () => {
      prisma.order.aggregate.mockResolvedValueOnce({
        _count: { id: 0 },
        _sum: { totalPrice: null },
      });
      prisma.order.count.mockResolvedValueOnce(0);
      prisma.orderReturn.count.mockResolvedValueOnce(0);
      prisma.channelListing.findFirst.mockResolvedValueOnce(null);

      const result = await service.getSummary(ORGANIZATION_ID);

      expect(result.todayOrders).toEqual({ count: 0, revenue: 0 });
      expect(result.lastModifiedAt).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // #2 getRevenueTrend — KST day bucket + empty range
  // -------------------------------------------------------------------------
  describe('getRevenueTrend', () => {
    it('maps $queryRaw rows to KST day strings + Number-cast bigint revenue/orderCount', async () => {
      // KST 2026-04-15 00:00 == UTC 2026-04-14 15:00 — day bucket stringifies to YYYY-MM-DD
      const day = new Date('2026-04-15T00:00:00.000Z'); // `::date` returns tz-less date; Prisma hydrates as Date at 00:00Z
      prisma.$queryRaw.mockResolvedValueOnce([
        { day, revenue: 120_000n, orderCount: 4n },
      ]);

      const from = new Date('2026-04-14T15:00:00.000Z');
      const to = new Date('2026-04-15T15:00:00.000Z');
      const result = await service.getRevenueTrend(ORGANIZATION_ID, from, to);

      expect(result).toEqual([
        { day: '2026-04-15', revenue: 120_000, orderCount: 4 },
      ]);
    });

    it('returns empty array when range has no orders (not error)', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);

      const result = await service.getRevenueTrend(
        ORGANIZATION_ID,
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2026-01-02T00:00:00.000Z'),
      );

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // #3 getProductRanking — 3 rows desc + master.name mapping
  // -------------------------------------------------------------------------
  describe('getProductRanking', () => {
    it('maps raw SQL rows to sellerProductId/Name + Number-cast revenue/orderCount', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          sellerProductId: 'EXT-A',
          sellerProductName: 'Master A',
          revenue: 700_000n,
          orderCount: 5n,
        },
        {
          sellerProductId: 'EXT-B',
          sellerProductName: 'Master B',
          revenue: 300_000n,
          orderCount: 3n,
        },
        {
          sellerProductId: 'EXT-C',
          sellerProductName: 'Master C',
          revenue: 100_000n,
          orderCount: 2n,
        },
      ]);

      const result = await service.getProductRanking(
        ORGANIZATION_ID,
        new Date('2026-04-01T00:00:00.000Z'),
        new Date('2026-05-01T00:00:00.000Z'),
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        sellerProductId: 'EXT-A',
        sellerProductName: 'Master A',
        revenue: 700_000,
        orderCount: 5,
      });
      expect(result[2].sellerProductName).toBe('Master C');
    });
  });

  // -------------------------------------------------------------------------
  // #4 getReturnSummary — ADR-0017 semantic (INNER JOIN + 2-hop IDOR + orphan)
  // -------------------------------------------------------------------------
  describe('getReturnSummary — ADR-0017 semantic', () => {
    function mockPrismaForReturn(overrides: {
      orderCount?: number;
      innerJoinReturnCount?: number;
      orphanCount?: number;
    }) {
      const orderCount = overrides.orderCount ?? 0;
      const innerJoinReturnCount = overrides.innerJoinReturnCount ?? 0;
      const orphanCount = overrides.orphanCount ?? 0;
      const orderReturnCount = vi.fn().mockImplementation((args: any) => {
        if (args?.where?.orderId === null) return Promise.resolve(orphanCount);
        if (args?.where?.order) return Promise.resolve(innerJoinReturnCount);
        throw new Error(`unexpected orderReturn.count args: ${JSON.stringify(args)}`);
      });
      return {
        order: { count: vi.fn().mockResolvedValue(orderCount) },
        orderReturn: { count: orderReturnCount },
      } as any;
    }

    it('returnRate = returns whose order.orderedAt ∈ period / orders in period', async () => {
      const mockPrisma = mockPrismaForReturn({ orderCount: 3, innerJoinReturnCount: 1, orphanCount: 0 });
      const svc = new ChannelDashboardService(mockPrisma as unknown as PrismaService);
      const result = await svc.getReturnSummary('companyA', new Date('2026-04-01'), new Date('2026-05-01'));
      expect(result).toEqual({
        orderCount: 3,
        returnCount: 1,
        returnRate: 1 / 3,
        orphanReturnCount: 0,
      });
    });

    it('orphanReturnCount side metric (orderId NULL AND requestedAt in period)', async () => {
      const mockPrisma = mockPrismaForReturn({ orderCount: 10, innerJoinReturnCount: 2, orphanCount: 3 });
      const svc = new ChannelDashboardService(mockPrisma as unknown as PrismaService);
      const result = await svc.getReturnSummary('companyA', new Date('2026-04-01'), new Date('2026-05-01'));
      expect(result).toEqual({
        orderCount: 10,
        returnCount: 2,
        returnRate: 0.2,
        orphanReturnCount: 3,
      });
    });

    it('returnRate = 0 when orderCount = 0 (no division by zero)', async () => {
      const mockPrisma = mockPrismaForReturn({ orderCount: 0, innerJoinReturnCount: 0, orphanCount: 0 });
      const svc = new ChannelDashboardService(mockPrisma as unknown as PrismaService);
      const result = await svc.getReturnSummary('companyA', new Date('2026-04-01'), new Date('2026-05-01'));
      expect(result.returnRate).toBe(0);
    });

    it('IDOR — 2-hop organizationId on relation filter + orphan organizationId', async () => {
      const orderCount = vi.fn().mockResolvedValue(5);
      const orderReturnCount = vi.fn().mockImplementation((args: any) => {
        if (args?.where?.orderId === null) return Promise.resolve(0);
        return Promise.resolve(1);
      });
      const mockPrisma = { order: { count: orderCount }, orderReturn: { count: orderReturnCount } } as any;
      const svc = new ChannelDashboardService(mockPrisma as unknown as PrismaService);
      await svc.getReturnSummary('companyA', new Date('2026-04-01'), new Date('2026-05-01'));

      // Order count: top-level organizationId
      expect(orderCount).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'companyA' }),
      }));

      // INNER JOIN return count: organizationId on BOTH top-level AND order relation (2-hop)
      expect(orderReturnCount).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'companyA',
          order: expect.objectContaining({
            organizationId: 'companyA',
            orderedAt: expect.objectContaining({
              gte: expect.any(Date),
              lt: expect.any(Date),
            }),
          }),
        }),
      }));

      // Orphan count: top-level organizationId + orderId null + requestedAt
      expect(orderReturnCount).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'companyA',
          orderId: null,
          requestedAt: expect.objectContaining({
            gte: expect.any(Date),
            lt: expect.any(Date),
          }),
        }),
      }));
    });
  });

  // -------------------------------------------------------------------------
  // #5 getReturnReasonBreakdown — flat _count shape (R-12)
  // -------------------------------------------------------------------------
  describe('getReturnReasonBreakdown', () => {
    it('maps groupBy with flat `_count: number` to { reason, count }', async () => {
      prisma.orderReturn.groupBy.mockResolvedValueOnce([
        { reason: '단순변심', _count: 5 },
        { reason: '제품불량', _count: 2 },
      ]);

      const result = await service.getReturnReasonBreakdown(
        ORGANIZATION_ID,
        new Date('2026-04-01T00:00:00.000Z'),
        new Date('2026-05-01T00:00:00.000Z'),
      );

      expect(result).toEqual([
        { reason: '단순변심', count: 5 },
        { reason: '제품불량', count: 2 },
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // #6 getReturnFaultSplit — CUSTOMER/VENDOR only (C-11 drop unknown)
  // -------------------------------------------------------------------------
  describe('getReturnFaultSplit', () => {
    it('returns customer + vendor counts; drops unknown faultBy values', async () => {
      prisma.orderReturn.groupBy.mockResolvedValueOnce([
        { faultBy: 'CUSTOMER', _count: 7 },
        { faultBy: 'VENDOR', _count: 3 },
        { faultBy: 'COURIER', _count: 99 }, // C-11: dropped
        { faultBy: '', _count: 2 }, // corrupt row: dropped
      ]);

      const result = await service.getReturnFaultSplit(
        ORGANIZATION_ID,
        new Date('2026-04-01T00:00:00.000Z'),
        new Date('2026-05-01T00:00:00.000Z'),
      );

      expect(result).toEqual({ customer: 7, vendor: 3 });
    });

    it('returns 0/0 when no returns exist', async () => {
      prisma.orderReturn.groupBy.mockResolvedValueOnce([]);

      const result = await service.getReturnFaultSplit(
        ORGANIZATION_ID,
        new Date('2026-04-01T00:00:00.000Z'),
        new Date('2026-05-01T00:00:00.000Z'),
      );

      expect(result).toEqual({ customer: 0, vendor: 0 });
    });
  });
});
