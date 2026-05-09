import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { buildPerListingMetrics } from '../../../common/per-listing-profit';
import { SettlementsService } from '../settlements.service';

vi.mock('../../../common/per-listing-profit', () => ({
  buildPerListingMetrics: vi.fn(),
}));

const mockedBuildPerListingMetrics = vi.mocked(buildPerListingMetrics);

function makePrisma() {
  return {
    settlement: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}

function makeOperationAlerts() {
  return {
    start: vi.fn(async () => ({})),
    succeed: vi.fn(async () => ({})),
    fail: vi.fn(async () => ({})),
  };
}

const MOCK_SETTLEMENTS = [
  { id: 's1', organizationId: 'c1', period: '2025-03', expectedAmount: 1000000, actualAmount: 980000, difference: -20000, status: 'confirmed' },
  { id: 's2', organizationId: 'c1', period: '2025-02', expectedAmount: 900000, actualAmount: 0, difference: 0, status: 'pending' },
  { id: 's3', organizationId: 'c1', period: '2025-01', expectedAmount: 800000, actualAmount: 810000, difference: 10000, status: 'confirmed' },
  { id: 's4', organizationId: 'c1', period: '2024-12', expectedAmount: 1100000, actualAmount: 1100000, difference: 0, status: 'confirmed' },
];

describe('SettlementsService', () => {
  let service: SettlementsService;
  let prisma: ReturnType<typeof makePrisma>;

  const baseMetric = {
    listingId: '11111111-1111-4111-8111-111111111111',
    externalId: 'EXT-1',
    channel: 'coupang',
    channelName: '쿠팡',
    masterId: '22222222-2222-4222-8222-222222222222',
    masterCode: 'M-0001',
    masterName: '아기 로션',
    category: '유아동',
    grade: 'A',
    thumbnailUrl: null,
    revenue: 10_000,
    costOfGoods: 4_000,
    commission: 1_000,
    shippingCost: 500,
    adCost: 0,
    otherCost: 0,
    netProfit: 4_500,
    profitRate: 45,
    orderCount: 5,
  };

  beforeEach(() => {
    prisma = makePrisma();
    service = new SettlementsService(prisma as any);
    mockedBuildPerListingMetrics.mockReset();
    mockedBuildPerListingMetrics.mockResolvedValue([]);
  });

  describe('findAll', () => {
    it('returns all settlements when no period given', async () => {
      prisma.settlement.findMany.mockResolvedValue(MOCK_SETTLEMENTS);

      const result = await service.findAll('c1');

      expect(prisma.settlement.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'c1' },
        orderBy: { period: 'desc' },
      });
      expect(result).toHaveLength(4);
    });

    it('filters by exact month when period is YYYY-MM (7 chars)', async () => {
      const filtered = MOCK_SETTLEMENTS.filter(s => s.period === '2025-03');
      prisma.settlement.findMany.mockResolvedValue(filtered);

      const result = await service.findAll('c1', '2025-03');

      expect(prisma.settlement.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'c1', period: '2025-03' },
        orderBy: { period: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].period).toBe('2025-03');
    });

    it('filters by year prefix when period is YYYY (4 chars)', async () => {
      const filtered = MOCK_SETTLEMENTS.filter(s => s.period.startsWith('2025'));
      prisma.settlement.findMany.mockResolvedValue(filtered);

      const result = await service.findAll('c1', '2025');

      expect(prisma.settlement.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'c1', period: { startsWith: '2025' } },
        orderBy: { period: 'desc' },
      });
      expect(result).toHaveLength(3);
    });

    it('returns all settlements when period is an empty string', async () => {
      prisma.settlement.findMany.mockResolvedValue(MOCK_SETTLEMENTS);

      await service.findAll('c1', '');

      expect(prisma.settlement.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'c1' },
        orderBy: { period: 'desc' },
      });
    });
  });

  describe('reconcile', () => {
    it('tolerance: matched when diff <= 100', async () => {
      mockedBuildPerListingMetrics.mockResolvedValue([baseMetric]);
      prisma.$queryRaw.mockResolvedValue([
        { listing_id: baseMetric.listingId, total_price: 10_050n, order_count: 5n },
      ]);

      const result = await service.reconcile('c1', '2025-03');

      expect(result.details).toHaveLength(1);
      expect(result.details[0].status).toBe('matched');
      expect(result.details[0].isMatched).toBe(true);
      expect(result.summary.matchedCount).toBe(1);
      expect(result.summary.mismatchCount).toBe(0);
      expect(result.summary.totalCommission).toBe(1_000);
      expect(result.summary.totalShipping).toBe(500);
    });

    it('tolerance: minor_diff when 100 < diff <= 1000', async () => {
      mockedBuildPerListingMetrics.mockResolvedValue([baseMetric]);
      prisma.$queryRaw.mockResolvedValue([
        { listing_id: baseMetric.listingId, total_price: 10_500n, order_count: 5n },
      ]);

      const result = await service.reconcile('c1', '2025-03');

      expect(result.details[0].status).toBe('minor_diff');
      expect(result.details[0].isMatched).toBe(false);
      expect(result.summary.mismatchCount).toBe(1);
    });

    it('tolerance: mismatch when diff > 1000', async () => {
      mockedBuildPerListingMetrics.mockResolvedValue([baseMetric]);
      prisma.$queryRaw.mockResolvedValue([
        { listing_id: baseMetric.listingId, total_price: 12_000n, order_count: 5n },
      ]);

      const result = await service.reconcile('c1', '2025-03');

      expect(result.details[0].status).toBe('mismatch');
      expect(result.details[0].isMatched).toBe(false);
    });

    it('returns empty details and zero summary when live metrics are empty', async () => {
      mockedBuildPerListingMetrics.mockResolvedValue([]);
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.reconcile('c1', '2025-03');

      expect(result.details).toEqual([]);
      expect(result.summary).toEqual({
        totalPlRevenue: 0,
        totalOrderRevenue: 0,
        totalCommission: 0,
        totalShipping: 0,
        revenueDifference: 0,
        productCount: 0,
        orderCount: 0,
        matchedCount: 0,
        mismatchCount: 0,
        matchRate: 0,
      });
    });

    it('converts bigint SUM to Number in Number() conversion', async () => {
      mockedBuildPerListingMetrics.mockResolvedValue([
        {
          ...baseMetric,
          revenue: 3_000_000_000,
          commission: 0,
          shippingCost: 0,
          netProfit: 0,
          orderCount: 30,
        },
      ]);
      prisma.$queryRaw.mockResolvedValue([
        { listing_id: baseMetric.listingId, total_price: 3_000_000_000n, order_count: 30n },
      ]);

      const result = await service.reconcile('c1', '2025-03');

      expect(typeof result.details[0].orderTotal).toBe('number');
      expect(result.details[0].orderTotal).toBe(3_000_000_000);
      expect(result.summary.totalOrderRevenue).toBe(3_000_000_000);
      expect(result.summary.orderCount).toBe(30);
    });

    it('uses KST month window and aligns refunded exclusion with live helper', async () => {
      await service.reconcile('c1', '2025-03');

      expect(mockedBuildPerListingMetrics).toHaveBeenCalledTimes(1);
      expect(mockedBuildPerListingMetrics).toHaveBeenCalledWith(
        prisma as any,
        'c1',
        new Date('2025-02-28T15:00:00.000Z'),
        new Date('2025-03-31T15:00:00.000Z'),
      );

      const [strings, organizationId, from, to] = prisma.$queryRaw.mock.calls[0] ?? [];
      expect([organizationId, from, to]).toEqual([
        'c1',
        new Date('2025-02-28T15:00:00.000Z'),
        new Date('2025-03-31T15:00:00.000Z'),
      ]);
      expect(strings.join('')).toContain(
        "AND o.status NOT IN ('cancelled', 'returned', 'refunded')",
      );
    });

    it('opens and closes an operation alert for manual reconcile runs', async () => {
      const operationAlerts = makeOperationAlerts();
      service = new SettlementsService(prisma as any, operationAlerts as never);
      mockedBuildPerListingMetrics.mockResolvedValue([baseMetric]);
      prisma.$queryRaw.mockResolvedValue([
        { listing_id: baseMetric.listingId, total_price: 10_000n, order_count: 5n },
      ]);

      await service.reconcile('c1', '2025-03', 'user-1');

      expect(operationAlerts.start).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'c1',
          actorUserId: 'user-1',
          operationKey: 'settlements-reconcile:2025-03',
          type: 'settlements_reconcile',
          title: '정산 대사 실행',
          sourceType: 'finance_reconcile',
          sourceId: '2025-03',
          href: '/sales-analysis',
        }),
      );
      expect(operationAlerts.succeed).toHaveBeenCalledWith(
        'c1',
        'settlements-reconcile:2025-03',
        expect.objectContaining({
          href: '/sales-analysis',
          metadata: expect.objectContaining({
            period: '2025-03',
            matchedCount: 1,
            mismatchCount: 0,
          }),
        }),
      );
      expect(operationAlerts.fail).not.toHaveBeenCalled();
    });

    it('marks the reconcile operation alert failed when aggregation throws', async () => {
      const operationAlerts = makeOperationAlerts();
      service = new SettlementsService(prisma as any, operationAlerts as never);
      mockedBuildPerListingMetrics.mockRejectedValueOnce(new Error('aggregation failed'));

      await expect(service.reconcile('c1', '2025-03', 'user-1')).rejects.toThrow(
        'aggregation failed',
      );

      expect(operationAlerts.fail).toHaveBeenCalledWith(
        'c1',
        'settlements-reconcile:2025-03',
        expect.objectContaining({
          href: '/sales-analysis',
          metadata: expect.objectContaining({
            period: '2025-03',
            error: 'aggregation failed',
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('updates settlement when id + organizationId match', async () => {
      prisma.settlement.findFirst.mockResolvedValue({ id: 's1', organizationId: 'c1' });
      prisma.settlement.update.mockResolvedValue({ id: 's1', actualAmount: 1000 });

      const result = await service.update('s1', 'c1', { actualAmount: 1000 });

      expect(prisma.settlement.findFirst).toHaveBeenCalledWith({
        where: { id: 's1', organizationId: 'c1' },
      });
      expect(prisma.settlement.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { actualAmount: 1000 },
      });
      expect(result.actualAmount).toBe(1000);
    });

    it('throws BadRequestException when cross-organization access attempted (IDOR)', async () => {
      prisma.settlement.findFirst.mockResolvedValue(null);

      await expect(service.update('s1', 'c1', { actualAmount: 9999 }))
        .rejects.toThrow(BadRequestException);

      expect(prisma.settlement.findFirst).toHaveBeenCalledWith({
        where: { id: 's1', organizationId: 'c1' },
      });
      expect(prisma.settlement.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when settlement not found', async () => {
      prisma.settlement.findFirst.mockResolvedValue(null);

      await expect(service.update('missing', 'c1', { status: 'confirmed' }))
        .rejects.toThrow('정산 내역을 찾을 수 없습니다');
    });

    it('only updates provided fields', async () => {
      prisma.settlement.findFirst.mockResolvedValue({ id: 's1', organizationId: 'c1' });
      prisma.settlement.update.mockResolvedValue({ id: 's1', status: 'confirmed' });

      await service.update('s1', 'c1', { status: 'confirmed' });

      expect(prisma.settlement.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'confirmed' },
      });
    });
  });
});
