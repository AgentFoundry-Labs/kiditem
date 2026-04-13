import { describe, it, expect, vi } from 'vitest';
import { SettlementsService } from '../settlements.service';

function makePrisma() {
  return {
    settlement: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    profitLoss: { findMany: vi.fn().mockResolvedValue([]) },
    order: { findMany: vi.fn().mockResolvedValue([]) },
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
