import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SettlementsService } from '../settlements.service';

function makePrisma() {
  return {
    settlement: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    profitLoss: { findMany: vi.fn().mockResolvedValue([]) },
    order: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}

function makeService() {
  const prisma = makePrisma();
  return { service: new SettlementsService(prisma as any), prisma };
}

const MOCK_SETTLEMENTS = [
  { id: 's1', companyId: 'c1', period: '2025-03', expectedAmount: 1000000, actualAmount: 980000, difference: -20000, status: 'confirmed' },
  { id: 's2', companyId: 'c1', period: '2025-02', expectedAmount: 900000, actualAmount: 0, difference: 0, status: 'pending' },
  { id: 's3', companyId: 'c1', period: '2025-01', expectedAmount: 800000, actualAmount: 810000, difference: 10000, status: 'confirmed' },
  { id: 's4', companyId: 'c1', period: '2024-12', expectedAmount: 1100000, actualAmount: 1100000, difference: 0, status: 'confirmed' },
];

describe('SettlementsService.findAll', () => {
  it('returns all settlements when no period given', async () => {
    const { service, prisma } = makeService();
    prisma.settlement.findMany.mockResolvedValue(MOCK_SETTLEMENTS);

    const result = await service.findAll('c1');

    expect(prisma.settlement.findMany).toHaveBeenCalledWith({
      where: { companyId: 'c1' },
      orderBy: { period: 'desc' },
    });
    expect(result).toHaveLength(4);
  });

  it('filters by exact month when period is YYYY-MM (7 chars)', async () => {
    const { service, prisma } = makeService();
    const filtered = MOCK_SETTLEMENTS.filter(s => s.period === '2025-03');
    prisma.settlement.findMany.mockResolvedValue(filtered);

    const result = await service.findAll('c1', '2025-03');

    expect(prisma.settlement.findMany).toHaveBeenCalledWith({
      where: { companyId: 'c1', period: '2025-03' },
      orderBy: { period: 'desc' },
    });
    expect(result).toHaveLength(1);
    expect(result[0].period).toBe('2025-03');
  });

  it('filters by year prefix when period is YYYY (4 chars)', async () => {
    const { service, prisma } = makeService();
    const filtered = MOCK_SETTLEMENTS.filter(s => s.period.startsWith('2025'));
    prisma.settlement.findMany.mockResolvedValue(filtered);

    const result = await service.findAll('c1', '2025');

    expect(prisma.settlement.findMany).toHaveBeenCalledWith({
      where: { companyId: 'c1', period: { startsWith: '2025' } },
      orderBy: { period: 'desc' },
    });
    expect(result).toHaveLength(3);
  });

  it('returns all settlements when period is an empty string', async () => {
    const { service, prisma } = makeService();
    prisma.settlement.findMany.mockResolvedValue(MOCK_SETTLEMENTS);

    await service.findAll('c1', '');

    expect(prisma.settlement.findMany).toHaveBeenCalledWith({
      where: { companyId: 'c1' },
      orderBy: { period: 'desc' },
    });
  });
});

describe('SettlementsService.reconcile', () => {
  const baseListing = {
    id: 'l1',
    externalId: 'EXT-1',
    channel: 'coupang',
    channelName: '쿠팡',
    isDeleted: false,
    master: {
      id: 'm1',
      code: 'M-0001',
      name: '아기 로션',
      category: '유아동',
      abcGrade: 'A',
      thumbnailUrl: null,
    },
  };

  it('tolerance: matched when diff ≤ 100', async () => {
    const { service, prisma } = makeService();
    prisma.profitLoss.findMany.mockResolvedValue([
      {
        listingId: 'l1',
        revenue: 10000,
        commission: 1000,
        shippingCost: 500,
        netProfit: 2000,
        orderCount: 5,
        listing: baseListing,
      },
    ]);
    prisma.$queryRaw.mockResolvedValue([
      { listing_id: 'l1', total_price: 10050n, order_count: 5n },
    ]);

    const result = await service.reconcile('c1', '2025-03');
    expect(result.details).toHaveLength(1);
    expect(result.details[0].status).toBe('matched');
    expect(result.details[0].isMatched).toBe(true);
    expect(result.summary.matchedCount).toBe(1);
    expect(result.summary.mismatchCount).toBe(0);
  });

  it('tolerance: minor_diff when 100 < diff ≤ 1000', async () => {
    const { service, prisma } = makeService();
    prisma.profitLoss.findMany.mockResolvedValue([
      {
        listingId: 'l1',
        revenue: 10000,
        commission: 1000,
        shippingCost: 500,
        netProfit: 2000,
        orderCount: 5,
        listing: baseListing,
      },
    ]);
    prisma.$queryRaw.mockResolvedValue([
      { listing_id: 'l1', total_price: 10500n, order_count: 5n },
    ]);

    const result = await service.reconcile('c1', '2025-03');
    expect(result.details[0].status).toBe('minor_diff');
    expect(result.details[0].isMatched).toBe(false);
    expect(result.summary.mismatchCount).toBe(1);
  });

  it('tolerance: mismatch when diff > 1000', async () => {
    const { service, prisma } = makeService();
    prisma.profitLoss.findMany.mockResolvedValue([
      {
        listingId: 'l1',
        revenue: 10000,
        commission: 1000,
        shippingCost: 500,
        netProfit: 2000,
        orderCount: 5,
        listing: baseListing,
      },
    ]);
    prisma.$queryRaw.mockResolvedValue([
      { listing_id: 'l1', total_price: 12000n, order_count: 5n },
    ]);

    const result = await service.reconcile('c1', '2025-03');
    expect(result.details[0].status).toBe('mismatch');
    expect(result.details[0].isMatched).toBe(false);
  });

  it('handles missing order aggregate (listing with zero orders)', async () => {
    const { service, prisma } = makeService();
    prisma.profitLoss.findMany.mockResolvedValue([
      {
        listingId: 'l1',
        revenue: 0,
        commission: 0,
        shippingCost: 0,
        netProfit: 0,
        orderCount: 0,
        listing: baseListing,
      },
    ]);
    prisma.$queryRaw.mockResolvedValue([]); // no order aggregate rows

    const result = await service.reconcile('c1', '2025-03');
    expect(result.details[0].orderTotal).toBe(0);
    expect(result.details[0].orderCount).toBe(0);
    expect(result.details[0].status).toBe('matched');
  });

  it('converts bigint SUM to Number in Number() conversion', async () => {
    // bigint 사용 검증 — $queryRaw 가 bigint 반환해도 response 는 number.
    const { service, prisma } = makeService();
    prisma.profitLoss.findMany.mockResolvedValue([
      {
        listingId: 'l1',
        revenue: 3_000_000_000,
        commission: 0,
        shippingCost: 0,
        netProfit: 0,
        orderCount: 30,
        listing: baseListing,
      },
    ]);
    prisma.$queryRaw.mockResolvedValue([
      { listing_id: 'l1', total_price: 3_000_000_000n, order_count: 30n },
    ]);

    const result = await service.reconcile('c1', '2025-03');
    expect(typeof result.details[0].orderTotal).toBe('number');
    expect(result.details[0].orderTotal).toBe(3_000_000_000);
    expect(result.summary.totalOrderRevenue).toBe(3_000_000_000);
    expect(result.summary.orderCount).toBe(30);
  });
});

describe('SettlementsService.update', () => {
  it('updates settlement when id + companyId match', async () => {
    const { service, prisma } = makeService();
    prisma.settlement.findFirst.mockResolvedValue({ id: 's1', companyId: 'c1' });
    prisma.settlement.update.mockResolvedValue({ id: 's1', actualAmount: 1000 });

    const result = await service.update('s1', 'c1', { actualAmount: 1000 });

    expect(prisma.settlement.findFirst).toHaveBeenCalledWith({
      where: { id: 's1', companyId: 'c1' },
    });
    expect(prisma.settlement.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { actualAmount: 1000 },
    });
    expect(result.actualAmount).toBe(1000);
  });

  it('throws BadRequestException when cross-company access attempted (IDOR)', async () => {
    const { service, prisma } = makeService();
    // Cross-tenant: settlement s1 은 c2 소유, 요청자는 c1 → findFirst 로 cross-tenant 검색 실패
    prisma.settlement.findFirst.mockResolvedValue(null);

    await expect(service.update('s1', 'c1', { actualAmount: 9999 }))
      .rejects.toThrow(BadRequestException);

    expect(prisma.settlement.findFirst).toHaveBeenCalledWith({
      where: { id: 's1', companyId: 'c1' },
    });
    expect(prisma.settlement.update).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when settlement not found', async () => {
    const { service, prisma } = makeService();
    prisma.settlement.findFirst.mockResolvedValue(null);

    await expect(service.update('missing', 'c1', { status: 'confirmed' }))
      .rejects.toThrow('정산 내역을 찾을 수 없습니다');
  });

  it('only updates provided fields', async () => {
    const { service, prisma } = makeService();
    prisma.settlement.findFirst.mockResolvedValue({ id: 's1', companyId: 'c1' });
    prisma.settlement.update.mockResolvedValue({ id: 's1', status: 'confirmed' });

    await service.update('s1', 'c1', { status: 'confirmed' });

    expect(prisma.settlement.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'confirmed' },
    });
  });
});
