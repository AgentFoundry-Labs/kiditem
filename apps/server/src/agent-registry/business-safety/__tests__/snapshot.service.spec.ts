import { describe, it, expect, vi } from 'vitest';
import { SnapshotService } from '../snapshot.service';

function makePrisma() {
  return {
    product: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    agentEvent: {
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe('SnapshotService', () => {
  it('captures before/after values for budget actions', async () => {
    const prisma = makePrisma();
    prisma.product.findUnique.mockResolvedValue({
      id: 'p-1', adBudgetLimit: 10000, adTier: '1차', sellPrice: 15000,
    });

    const service = new SnapshotService(prisma);
    const count = await service.capture({
      agentId: 'a-1', runId: 'r-1', companyId: 'c-1',
      actions: [{ product_id: 'p-1', action: 'increase_budget', new_adBudgetLimit: 13000 }],
    });

    expect(count).toBe(1);
    expect(prisma.agentEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        eventType: 'action_snapshot',
        fieldName: 'adBudgetLimit',
        valueBefore: 10000,
        valueAfter: 13000,
      })],
    });
  });

  it('captures multiple fields for stop_ad', async () => {
    const prisma = makePrisma();
    prisma.product.findUnique.mockResolvedValue({
      id: 'p-1', adBudgetLimit: 10000, adTier: '1차', sellPrice: 15000,
    });

    const service = new SnapshotService(prisma);
    const count = await service.capture({
      agentId: 'a-1', runId: 'r-1', companyId: 'c-1',
      actions: [{ product_id: 'p-1', action: 'stop_ad' }],
    });

    expect(count).toBe(2); // adTier + adBudgetLimit
  });

  it('returns 0 for empty actions', async () => {
    const prisma = makePrisma();
    const service = new SnapshotService(prisma);
    const count = await service.capture({
      agentId: 'a-1', runId: 'r-1', companyId: 'c-1', actions: [],
    });
    expect(count).toBe(0);
  });

  it('rollback restores values', async () => {
    const prisma = makePrisma();
    prisma.agentEvent.findMany.mockResolvedValue([
      { id: 's-1', recordId: 'p-1', fieldName: 'adBudgetLimit', valueBefore: 10000 },
    ]);

    const service = new SnapshotService(prisma);
    const result = await service.rollback('r-1');

    expect(result.restored).toBe(1);
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { adBudgetLimit: 10000 },
    });
  });
});
