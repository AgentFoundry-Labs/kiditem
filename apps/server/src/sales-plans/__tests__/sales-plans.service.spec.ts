import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SalesPlansService } from '../sales-plans.service';

/**
 * Plan B2c.orders T9 — sales-plans IDOR 3건 + KST boundary.
 * update / syncActuals / delete 가 findFirst({id, companyId}) 로 cross-company 격리.
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
    profitLoss: {
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
  });

  describe('findAll', () => {
    it('lists plans scoped to companyId', async () => {
      prisma.salesPlan.findMany.mockResolvedValue([]);

      await service.findAll('company-1');

      expect(prisma.salesPlan.findMany).toHaveBeenCalledWith({
        where: { companyId: 'company-1' },
        orderBy: { period: 'desc' },
      });
    });
  });

  describe('create', () => {
    it('throws BadRequest when duplicate period exists for company', async () => {
      prisma.salesPlan.findUnique.mockResolvedValue({ id: 'p1' });

      await expect(
        service.create('company-1', { period: '2026-04' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.salesPlan.findUnique).toHaveBeenCalledWith({
        where: { companyId_period: { companyId: 'company-1', period: '2026-04' } },
      });
    });

    it('creates plan with defaults when duplicate not found', async () => {
      prisma.salesPlan.findUnique.mockResolvedValue(null);
      prisma.salesPlan.create.mockResolvedValue({ id: 'new' });

      await service.create('company-1', {
        period: '2026-05',
        targetRevenue: 100,
      } as any);

      expect(prisma.salesPlan.create).toHaveBeenCalledWith({
        data: {
          companyId: 'company-1',
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
    it('uses findFirst with {id, companyId} (not findUnique by id only)', async () => {
      prisma.salesPlan.findFirst.mockResolvedValue({ id: 'p1', companyId: 'company-1' });
      prisma.salesPlan.update.mockResolvedValue({ id: 'p1' });

      await service.update('p1', 'company-1', { notes: 'updated' } as any);

      expect(prisma.salesPlan.findFirst).toHaveBeenCalledWith({
        where: { id: 'p1', companyId: 'company-1' },
      });
      expect(prisma.salesPlan.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { notes: 'updated' },
      });
    });

    it('throws NotFoundException when plan belongs to another company', async () => {
      // Cross-company access: findFirst returns null because scope filter blocks
      prisma.salesPlan.findFirst.mockResolvedValue(null);

      await expect(
        service.update('p1', 'other-company', { notes: 'evil' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.salesPlan.update).not.toHaveBeenCalled();
    });
  });

  describe('syncActuals — IDOR fix + KST boundary', () => {
    it('rejects cross-company access with NotFoundException', async () => {
      prisma.salesPlan.findFirst.mockResolvedValue(null);

      await expect(service.syncActuals('p1', 'other-company')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(prisma.order.aggregate).not.toHaveBeenCalled();
      expect(prisma.profitLoss.aggregate).not.toHaveBeenCalled();
    });

    it('uses kstMonthStart for Order.aggregate window (2026-04-30 23:30 KST falls into April)', async () => {
      prisma.salesPlan.findFirst.mockResolvedValue({
        id: 'p1',
        companyId: 'company-1',
        period: '2026-04',
      });
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 5_000_000 },
        _count: { id: 12 },
      });
      prisma.profitLoss.aggregate.mockResolvedValue({ _sum: { netProfit: 1_000_000 } });
      prisma.salesPlan.update.mockResolvedValue({ id: 'p1' });

      await service.syncActuals('p1', 'company-1');

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

      // Scope check — uses injected companyId, not plan.companyId implicitly
      expect(aggregateCall.where.companyId).toBe('company-1');
      expect(aggregateCall.where.status).toEqual({ notIn: ['cancelled', 'returned'] });
    });

    it('writes aggregate sums to actualRevenue / actualOrders / actualProfit', async () => {
      prisma.salesPlan.findFirst.mockResolvedValue({
        id: 'p1',
        companyId: 'company-1',
        period: '2026-04',
      });
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 3_200_000 },
        _count: { id: 27 },
      });
      prisma.profitLoss.aggregate.mockResolvedValue({ _sum: { netProfit: 640_000 } });
      prisma.salesPlan.update.mockResolvedValue({ id: 'p1' });

      await service.syncActuals('p1', 'company-1');

      expect(prisma.salesPlan.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: {
          actualRevenue: 3_200_000,
          actualOrders: 27,
          actualProfit: 640_000,
        },
      });
    });

    it('defaults to zero when Order.aggregate and ProfitLoss.aggregate return null sums', async () => {
      prisma.salesPlan.findFirst.mockResolvedValue({
        id: 'p1',
        companyId: 'company-1',
        period: '2026-04',
      });
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: null },
        _count: { id: 0 },
      });
      prisma.profitLoss.aggregate.mockResolvedValue({ _sum: { netProfit: null } });
      prisma.salesPlan.update.mockResolvedValue({ id: 'p1' });

      await service.syncActuals('p1', 'company-1');

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
        companyId: 'company-1',
        period: '2026-12',
      });
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 0 },
        _count: { id: 0 },
      });
      prisma.profitLoss.aggregate.mockResolvedValue({ _sum: { netProfit: 0 } });
      prisma.salesPlan.update.mockResolvedValue({ id: 'p1' });

      await service.syncActuals('p1', 'company-1');

      const window = prisma.order.aggregate.mock.calls[0][0].where.orderedAt;
      // periodStart = 2026-12-01 KST = 2026-11-30 15:00 UTC
      expect(window.gte.toISOString()).toBe('2026-11-30T15:00:00.000Z');
      // periodEnd = 2027-01-01 KST = 2026-12-31 15:00 UTC
      expect(window.lt.toISOString()).toBe('2026-12-31T15:00:00.000Z');
    });
  });

  describe('delete — IDOR fix', () => {
    it('uses findFirst with {id, companyId}', async () => {
      prisma.salesPlan.findFirst.mockResolvedValue({ id: 'p1', companyId: 'company-1' });
      prisma.salesPlan.delete.mockResolvedValue({ id: 'p1' });

      const result = await service.delete('p1', 'company-1');

      expect(prisma.salesPlan.findFirst).toHaveBeenCalledWith({
        where: { id: 'p1', companyId: 'company-1' },
      });
      expect(prisma.salesPlan.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException for cross-company id', async () => {
      prisma.salesPlan.findFirst.mockResolvedValue(null);

      await expect(service.delete('p1', 'other-company')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(prisma.salesPlan.delete).not.toHaveBeenCalled();
    });
  });
});
