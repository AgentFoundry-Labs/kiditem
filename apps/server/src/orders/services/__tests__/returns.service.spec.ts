import { describe, expect, it, vi } from 'vitest';
import { NotImplementedException } from '@nestjs/common';
import { ReturnsService } from '../returns.service';

function makePrisma() {
  const prisma = {
    orderReturn: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  return prisma;
}

describe('ReturnsService', () => {
  it('owns transactions around canonical return list, detail, and status reads', async () => {
    const returned = {
      id: 'return-1',
      organizationId: 'organization-1',
      type: 'RETURN',
      status: 'UC',
      requestedAt: new Date('2026-05-01T00:00:00.000Z'),
      lineItems: [],
    };
    const prisma = makePrisma();
    prisma.orderReturn.findMany.mockResolvedValue([returned]);
    prisma.orderReturn.findFirst.mockResolvedValue(returned);
    prisma.orderReturn.groupBy.mockResolvedValue([
      { status: 'UC', _count: 1 },
      { status: 'RETURNS_COMPLETED', _count: 2 },
    ]);
    const service = new ReturnsService(prisma as any);

    await expect(service.findAll('organization-1', { type: 'return' })).resolves
      .toMatchObject({ items: [returned], total: 1, type: 'return' });
    await expect(service.findOne('return-1', 'organization-1')).resolves.toBe(returned);
    await expect(service.getStats('organization-1')).resolves.toEqual({
      stats: { total: 3, uc: 1, rc: 0, completed: 2 },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('rejects approval before reading or mutating the database', async () => {
    const prisma = makePrisma();
    const service = new ReturnsService(prisma as any);

    await expect(service.approve(12345, 'organization-1')).rejects.toBeInstanceOf(
      NotImplementedException,
    );
    expect(prisma.orderReturn.findFirst).not.toHaveBeenCalled();
    expect(prisma.orderReturn.findMany).not.toHaveBeenCalled();
  });
});
