import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfitLossService } from '../profit-loss.service';
import { SettlementsService } from '../../../settlements/settlements.service';
import { BadRequestException } from '@nestjs/common';

// ── Prisma mocks ──

function makePrisma() {
  return {
    profitLoss: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    product: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    settlement: {
      findMany: vi.fn().mockResolvedValue([]),
      // T8 IDOR fix — update path 는 findFirst({id, companyId}) 경유. findUnique 는 레거시 (이 spec 외 무사용).
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    order: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}

// ── ProfitLossService — Plan B2c pending (stubbed in Plan A.5) ──

describe('ProfitLossService — Plan B2c pending', () => {
  let service: ProfitLossService;

  beforeEach(() => {
    service = new ProfitLossService(makePrisma() as any);
  });

  it('findAll throws until Plan B2c rewrites against Order/OrderLineItem', async () => {
    await expect(service.findAll('2026-01')).rejects.toThrow(/Plan B2c migration/);
  });

  it('findAll with no period also throws (stub does not differentiate)', async () => {
    await expect(service.findAll()).rejects.toThrow(/Plan B2c migration/);
  });
});

// ── SettlementsService ──

describe('SettlementsService — settlement create and update flow', () => {
  let service: SettlementsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new SettlementsService(prisma as any);
  });

  it('findAll by companyId → returns settlements ordered by period desc', async () => {
    const settlements = [
      { id: 's-1', companyId: 'company-1', period: '2026-01', expectedAmount: 3000000 },
    ];
    prisma.settlement.findMany.mockResolvedValue(settlements);

    const result = await service.findAll('company-1');

    expect(prisma.settlement.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      orderBy: { period: 'desc' },
    });
    expect(result).toEqual(settlements);
  });

  it('create settlement → calls prisma.settlement.create with correct fields', async () => {
    const dto = {
      period: '2026-01',
      expectedAmount: 3000000,
      commission: 324000,
      shippingFee: 90000,
      orderCount: 85,
      returnCount: 3,
    };
    const created = { id: 's-new', companyId: 'company-1', ...dto };
    prisma.settlement.create.mockResolvedValue(created);

    const result = await service.create('company-1', dto as any);

    expect(prisma.settlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company-1',
        period: '2026-01',
        expectedAmount: 3000000,
        commission: 324000,
        orderCount: 85,
      }),
    });
    expect(result).toEqual(created);
  });

  it('update settlement → updates fields when found (findFirst + companyId scope)', async () => {
    const existing = { id: 's-1', companyId: 'company-1', period: '2026-01', status: 'pending' };
    prisma.settlement.findFirst.mockResolvedValue(existing);
    prisma.settlement.update.mockResolvedValue({ ...existing, actualAmount: 2950000, status: 'confirmed' });

    const result = await service.update('s-1', 'company-1', { actualAmount: 2950000, status: 'confirmed' } as any);

    expect(prisma.settlement.findFirst).toHaveBeenCalledWith({
      where: { id: 's-1', companyId: 'company-1' },
    });
    expect(prisma.settlement.update).toHaveBeenCalledWith({
      where: { id: 's-1' },
      data: expect.objectContaining({ actualAmount: 2950000, status: 'confirmed' }),
    });
    expect((result as any).status).toBe('confirmed');
  });

  it('update non-existent settlement → throws BadRequestException (IDOR path)', async () => {
    prisma.settlement.findFirst.mockResolvedValue(null);

    await expect(
      service.update('non-existent', 'company-1', { actualAmount: 1000 } as any),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.settlement.update).not.toHaveBeenCalled();
  });
});
