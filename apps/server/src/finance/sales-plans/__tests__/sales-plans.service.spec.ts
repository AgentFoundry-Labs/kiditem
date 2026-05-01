import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { buildPerListingMetrics } from '../../../common/per-listing-profit';
import { SalesPlansService } from '../sales-plans.service';

vi.mock('../../../common/per-listing-profit', () => ({
  buildPerListingMetrics: vi.fn(),
}));

const mockedBuildPerListingMetrics = vi.mocked(buildPerListingMetrics);

/**
 * Plan B2c.orders T9 — sales-plans IDOR 3건 + KST boundary.
 * update / syncActuals / delete 가 findFirst({id, organizationId}) 로 cross-organization 격리.
 * syncActuals 는 kstMonthStart 로 월 경계 (KST midnight) 를 계산.
 */

function makePrisma() {
  return {
    salesPlan: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    order: {
      aggregate: vi.fn(),
    },
  };
}

describe('SalesPlansService', () => {
  let service: SalesPlansService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new SalesPlansService(prisma as any);
    mockedBuildPerListingMetrics.mockReset();
    mockedBuildPerListingMetrics.mockResolvedValue([]);
  });

  describe('findAll', () => {
    it('lists plans scoped to organizationId', async () => {
      prisma.salesPlan.findMany.mockResolvedValue([]);

      await service.findAll('organization-1');

      expect(prisma.salesPlan.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'organization-1' },
        orderBy: { period: 'desc' },
      });
    });
  });

  describe('create', () => {
    it('throws BadRequest when duplicate period exists for organization', async () => {
      prisma.salesPlan.findFirst.mockResolvedValue({ id: 'p1' });

      await expect(
        service.create('organization-1', { period: '2026-04' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.salesPlan.findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'organization-1', period: '2026-04' },
      });
    });

    it('creates plan with defaults when duplicate not found', async () => {
      prisma.salesPlan.findFirst.mockResolvedValue(null);
      prisma.salesPlan.create.mockResolvedValue({ id: 'new' });

      await service.create('organization-1', {
        period: '2026-05',
        targetRevenue: 100,
      } as any);

      expect(prisma.salesPlan.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'organization-1',
          period: '2026-05',
          targetRevenue: 100,
          targetOrders: 0,
          targetProfit: 0,
          notes: undefined,
        },
      });
    });
  });

  describe('update — IDOR fix', () => {
    it('uses findFirst with {id, organizationId} (not findUnique by id only)', async () => {
      prisma.salesPlan.findFirst.mockResolvedValue({ id: 'p1', organizationId: 'organization-1' });
      prisma.salesPlan.update.mockResolvedValue({ id: 'p1' });

      await service.update('p1', 'organization-1', { notes: 'updated' } as any);

      expect(prisma.salesPlan.findFirst).toHaveBeenCalledWith({
        where: { id: 'p1', organizationId: 'organization-1' },
      });
      expect(prisma.salesPlan.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { notes: 'updated' },
      });
    });

    it('throws NotFoundException when plan belongs to another organization', async () => {
      // Cross-organization access: findFirst returns null because scope filter blocks
      prisma.salesPlan.findFirst.mockResolvedValue(null);

      await expect(
        service.update('p1', 'other-organization', { notes: 'evil' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.salesPlan.update).not.toHaveBeenCalled();
    });
  });

  describe('syncActuals — IDOR fix + KST boundary', () => {
    it('rejects cross-organization access with NotFoundException', async () => {
      prisma.salesPlan.findFirst.mockResolvedValue(null);

      await expect(service.syncActuals('p1', 'other-organization')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(prisma.order.aggregate).not.toHaveBeenCalled();
      expect(mockedBuildPerListingMetrics).not.toHaveBeenCalled();
    });

    it('uses kstMonthStart for Order.aggregate window (2026-04-30 23:30 KST falls into April)', async () => {
      prisma.salesPlan.findFirst.mockResolvedValue({
        id: 'p1',
        organizationId: 'organization-1',
        period: '2026-04',
      });
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 5_000_000 },
        _count: { id: 12 },
      });
      mockedBuildPerListingMetrics.mockResolvedValue([
        { listingId: 'l1', netProfit: 1_000_000 } as any,
      ]);
      prisma.salesPlan.update.mockResolvedValue({ id: 'p1' });

      await service.syncActuals('p1', 'organization-1');

      const aggregateCall = prisma.order.aggregate.mock.calls[0][0];
      const window = aggregateCall.where.orderedAt;

      // periodStart = 2026-04-01 00:00:00 KST = 2026-03-31 15:00:00 UTC
      expect(window.gte.toISOString()).toBe('2026-03-31T15:00:00.000Z');
      // periodEnd = 2026-05-01 00:00:00 KST = 2026-04-30 15:00:00 UTC
      expect(window.lt.toISOString()).toBe('2026-04-30T15:00:00.000Z');

      // 2026-04-30 23:30 KST = 2026-04-30 14:30 UTC → falls in [gte, lt)
      const edgeOrder = new Date('2026-04-30T14:30:00.000Z');
      expect(edgeOrder >= window.gte && edgeOrder < window.lt).toBe(true);

      // 2026-05-01 00:00 KST = 2026-04-30 15:00 UTC → excluded (boundary)
      const nextMonth = new Date('2026-04-30T15:00:00.000Z');
      expect(nextMonth < window.lt).toBe(false);

      // Scope check — uses injected organizationId, not plan.organizationId implicitly
      expect(aggregateCall.where.organizationId).toBe('organization-1');
      expect(aggregateCall.where.status).toEqual({
        notIn: ['cancelled', 'returned', 'refunded'],
      });
      expect(mockedBuildPerListingMetrics).toHaveBeenCalledWith(
        prisma as any,
        'organization-1',
        window.gte,
        window.lt,
      );
    });

    it('writes aggregate sums to actualRevenue / actualOrders / actualProfit', async () => {
      prisma.salesPlan.findFirst.mockResolvedValue({
        id: 'p1',
        organizationId: 'organization-1',
        period: '2026-04',
      });
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 3_200_000 },
        _count: { id: 27 },
      });
      mockedBuildPerListingMetrics.mockResolvedValue([
        { listingId: 'l1', netProfit: 700_000 } as any,
        { listingId: 'l2', netProfit: -60_000 } as any,
      ]);
      prisma.salesPlan.update.mockResolvedValue({ id: 'p1' });

      await service.syncActuals('p1', 'organization-1');

      expect(prisma.salesPlan.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: {
          actualRevenue: 3_200_000,
          actualOrders: 27,
          actualProfit: 640_000,
        },
      });
    });

    it('defaults to zero when Order.aggregate is empty and live metrics are empty', async () => {
      prisma.salesPlan.findFirst.mockResolvedValue({
        id: 'p1',
        organizationId: 'organization-1',
        period: '2026-04',
      });
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: null },
        _count: { id: 0 },
      });
      mockedBuildPerListingMetrics.mockResolvedValue([]);
      prisma.salesPlan.update.mockResolvedValue({ id: 'p1' });

      await service.syncActuals('p1', 'organization-1');

      expect(prisma.salesPlan.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: {
          actualRevenue: 0,
          actualOrders: 0,
          actualProfit: 0,
        },
      });
    });

    it('month=12 wraps periodEnd to next year January (KST)', async () => {
      prisma.salesPlan.findFirst.mockResolvedValue({
        id: 'p1',
        organizationId: 'organization-1',
        period: '2026-12',
      });
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 0 },
        _count: { id: 0 },
      });
      mockedBuildPerListingMetrics.mockResolvedValue([]);
      prisma.salesPlan.update.mockResolvedValue({ id: 'p1' });

      await service.syncActuals('p1', 'organization-1');

      const window = prisma.order.aggregate.mock.calls[0][0].where.orderedAt;
      // periodStart = 2026-12-01 KST = 2026-11-30 15:00 UTC
      expect(window.gte.toISOString()).toBe('2026-11-30T15:00:00.000Z');
      // periodEnd = 2027-01-01 KST = 2026-12-31 15:00 UTC
      expect(window.lt.toISOString()).toBe('2026-12-31T15:00:00.000Z');
      expect(mockedBuildPerListingMetrics).toHaveBeenCalledWith(
        prisma as any,
        'organization-1',
        window.gte,
        window.lt,
      );
    });
  });

  describe('delete — IDOR fix', () => {
    it('uses findFirst with {id, organizationId}', async () => {
      prisma.salesPlan.findFirst.mockResolvedValue({ id: 'p1', organizationId: 'organization-1' });
      prisma.salesPlan.delete.mockResolvedValue({ id: 'p1' });

      const result = await service.delete('p1', 'organization-1');

      expect(prisma.salesPlan.findFirst).toHaveBeenCalledWith({
        where: { id: 'p1', organizationId: 'organization-1' },
      });
      expect(prisma.salesPlan.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException for cross-organization id', async () => {
      prisma.salesPlan.findFirst.mockResolvedValue(null);

      await expect(service.delete('p1', 'other-organization')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(prisma.salesPlan.delete).not.toHaveBeenCalled();
    });
  });
});
