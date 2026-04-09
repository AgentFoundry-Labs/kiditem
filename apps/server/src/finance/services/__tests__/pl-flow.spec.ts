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

// ── Fixtures ──

const MOCK_PL_RECORD = {
  id: 'pl-1',
  productId: 'prod-1',
  year: 2026,
  month: 1,
  revenue: 1000000,
  cogs: 200000,
  commission: 108000,
  shippingCost: 30000,
  adCost: 50000,
  otherCost: 10000,
  netProfit: 602000,
  orderCount: 28,
  returnCount: 2,
  product: {
    id: 'prod-1',
    name: '아동 겨울 점퍼',
    coupangProductId: 'CP-001',
    abcGrade: 'A',
    commissionRate: null,
    costCny: null,
    shippingCost: 0,
    company: { name: '키즈패션' },
  },
};

// ── ProfitLossService ──

describe('ProfitLossService — financial data query', () => {
  let service: ProfitLossService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ProfitLossService(prisma as any);
  });

  it('findAll with period → returns P&L records with correct shape', async () => {
    prisma.profitLoss.findMany.mockResolvedValue([MOCK_PL_RECORD]);
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await service.findAll('2026-01');

    expect(prisma.profitLoss.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { year: 2026, month: 1 },
      }),
    );
    expect(result).toHaveLength(1);
    const item = result[0];
    expect(item.productId).toBe('prod-1');
    expect(item.productName).toBe('아동 겨울 점퍼');
    expect(item.revenue).toBe(1000000);
    expect(item.netProfit).toBe(602000);
    expect(item.period).toBe('2026-01');
  });

  it('response shape includes all required fields: revenue, costs, netProfit, profitRate', async () => {
    prisma.profitLoss.findMany.mockResolvedValue([MOCK_PL_RECORD]);
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await service.findAll('2026-01');
    const item = result[0];

    expect(item).toHaveProperty('revenue');
    expect(item).toHaveProperty('costOfGoods');
    expect(item).toHaveProperty('commission');
    expect(item).toHaveProperty('shippingCost');
    expect(item).toHaveProperty('adCost');
    expect(item).toHaveProperty('netProfit');
    expect(item).toHaveProperty('profitRate');
    expect(item).toHaveProperty('orderCount');
    expect(item).toHaveProperty('returnCount');
  });

  it('profitRate is calculated as (netProfit / revenue) * 100 rounded to 1 decimal', async () => {
    prisma.profitLoss.findMany.mockResolvedValue([MOCK_PL_RECORD]);
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await service.findAll('2026-01');
    const item = result[0];

    // 602000 / 1000000 = 0.602 → 60.2%
    expect(item.profitRate).toBe(60.2);
  });

  it('findAll with no period → uses current year/month', async () => {
    prisma.profitLoss.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);

    await service.findAll();

    const now = new Date();
    expect(prisma.profitLoss.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { year: now.getFullYear(), month: now.getMonth() + 1 },
      }),
    );
  });

  it('appends extra rows from $queryRaw for products not in PL records', async () => {
    prisma.profitLoss.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([
      { seller_product_id: 'CP-999', revenue: 500000, order_count: 15 },
    ]);
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'prod-extra',
        coupangProductId: 'CP-999',
        name: '키즈 운동화',
        abcGrade: 'B',
        commissionRate: null,
        costCny: null,
        shippingCost: 0,
        company: { name: '스포츠아동' },
      },
    ]);

    const result = await service.findAll('2026-01');

    expect(result).toHaveLength(1);
    expect(result[0].sku).toBe('CP-999');
    expect(result[0].revenue).toBe(500000);
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
      companyId: 'company-1',
      period: '2026-01',
      expectedAmount: 3000000,
      commission: 324000,
      shippingFee: 90000,
      orderCount: 85,
      returnCount: 3,
    };
    const created = { id: 's-new', ...dto };
    prisma.settlement.create.mockResolvedValue(created);

    const result = await service.create(dto as any);

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

  it('update settlement → updates fields when found', async () => {
    const existing = { id: 's-1', companyId: 'company-1', period: '2026-01', status: 'pending' };
    prisma.settlement.findUnique.mockResolvedValue(existing);
    prisma.settlement.update.mockResolvedValue({ ...existing, actualAmount: 2950000, status: 'confirmed' });

    const result = await service.update('s-1', { actualAmount: 2950000, status: 'confirmed' } as any);

    expect(prisma.settlement.update).toHaveBeenCalledWith({
      where: { id: 's-1' },
      data: expect.objectContaining({ actualAmount: 2950000, status: 'confirmed' }),
    });
    expect((result as any).status).toBe('confirmed');
  });

  it('update non-existent settlement → throws BadRequestException', async () => {
    prisma.settlement.findUnique.mockResolvedValue(null);

    await expect(service.update('non-existent', { actualAmount: 1000 } as any)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.settlement.update).not.toHaveBeenCalled();
  });
});
