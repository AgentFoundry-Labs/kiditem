import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChannelDashboardService } from '../channel-dashboard.service';
import type { PrismaService } from '../../../prisma/prisma.service';

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

const COMPANY_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

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

      const result = await service.getSummary(COMPANY_ID);

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

      const result = await service.getSummary(COMPANY_ID);

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
      const result = await service.getRevenueTrend(COMPANY_ID, from, to);

      expect(result).toEqual([
        { day: '2026-04-15', revenue: 120_000, orderCount: 4 },
      ]);
    });

    it('returns empty array when range has no orders (not error)', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);

      const result = await service.getRevenueTrend(
        COMPANY_ID,
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
        COMPANY_ID,
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
  // #4 getReturnSummary — zero-division guard
  // -------------------------------------------------------------------------
  describe('getReturnSummary', () => {
    it('returnRate = 0 when orderCount is 0 (not Infinity)', async () => {
      prisma.orderReturn.count.mockResolvedValueOnce(2);
      prisma.order.count.mockResolvedValueOnce(0);

      const result = await service.getReturnSummary(
        COMPANY_ID,
        new Date('2026-04-01T00:00:00.000Z'),
        new Date('2026-05-01T00:00:00.000Z'),
      );

      expect(result).toEqual({ returnCount: 2, orderCount: 0, returnRate: 0 });
      expect(Number.isFinite(result.returnRate)).toBe(true);
    });

    it('returnRate = returnCount / orderCount when orderCount > 0', async () => {
      prisma.orderReturn.count.mockResolvedValueOnce(3);
      prisma.order.count.mockResolvedValueOnce(30);

      const result = await service.getReturnSummary(
        COMPANY_ID,
        new Date('2026-04-01T00:00:00.000Z'),
        new Date('2026-05-01T00:00:00.000Z'),
      );

      expect(result.returnRate).toBeCloseTo(0.1, 6);
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
        COMPANY_ID,
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
        COMPANY_ID,
        new Date('2026-04-01T00:00:00.000Z'),
        new Date('2026-05-01T00:00:00.000Z'),
      );

      expect(result).toEqual({ customer: 7, vendor: 3 });
    });

    it('returns 0/0 when no returns exist', async () => {
      prisma.orderReturn.groupBy.mockResolvedValueOnce([]);

      const result = await service.getReturnFaultSplit(
        COMPANY_ID,
        new Date('2026-04-01T00:00:00.000Z'),
        new Date('2026-05-01T00:00:00.000Z'),
      );

      expect(result).toEqual({ customer: 0, vendor: 0 });
    });
  });
});
