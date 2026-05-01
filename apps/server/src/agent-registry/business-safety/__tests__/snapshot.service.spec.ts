import { describe, it, expect, vi } from 'vitest';
import { SnapshotService } from '../snapshot.service';

function makePrisma() {
  return {
    masterProduct: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    agentEvent: {
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as any;
}

describe('SnapshotService', () => {
  it('captures before/after values for budget actions (master product scoped to organizationId)', async () => {
    const prisma = makePrisma();
    prisma.masterProduct.findFirst.mockResolvedValue({
      id: 'p-1', adBudgetLimit: 10000, adTier: '1차', healthScore: 80,
    });

    const service = new SnapshotService(prisma);
    const count = await service.capture({
      agentId: 'a-1', runId: 'r-1', organizationId: 'c-1',
      actions: [{ product_id: 'p-1', action: 'increase_budget', new_adBudgetLimit: 13000 }],
    });

    expect(count).toBe(1);
    expect(prisma.masterProduct.findFirst).toHaveBeenCalledWith({
      where: { id: 'p-1', organizationId: 'c-1' },
      select: expect.any(Object),
    });
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
    prisma.masterProduct.findFirst.mockResolvedValue({
      id: 'p-1', adBudgetLimit: 10000, adTier: '1차', healthScore: 80,
    });

    const service = new SnapshotService(prisma);
    const count = await service.capture({
      agentId: 'a-1', runId: 'r-1', organizationId: 'c-1',
      actions: [{ product_id: 'p-1', action: 'stop_ad' }],
    });

    expect(count).toBe(2); // adTier + adBudgetLimit
  });

  it('returns 0 for empty actions', async () => {
    const prisma = makePrisma();
    const service = new SnapshotService(prisma);
    const count = await service.capture({
      agentId: 'a-1', runId: 'r-1', organizationId: 'c-1', actions: [],
    });
    expect(count).toBe(0);
  });

  it('rollback restores values — masterProduct.updateMany / agentEvent.updateMany binds organizationId', async () => {
    const prisma = makePrisma();
    prisma.agentEvent.findMany.mockResolvedValue([
      {
        id: 's-1',
        organizationId: 'c-1',
        recordId: 'p-1',
        fieldName: 'adBudgetLimit',
        valueBefore: 10000,
      },
    ]);

    const service = new SnapshotService(prisma);
    const result = await service.rollback('r-1', 'c-1');

    expect(result.restored).toBe(1);
    // Snapshot read scoped to (runId, organizationId)
    expect(prisma.agentEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          runId: 'r-1',
          organizationId: 'c-1',
          eventType: 'action_snapshot',
          restoredAt: null,
        }),
      }),
    );
    // Each restore binds (id, organizationId) on the underlying writes
    expect(prisma.masterProduct.updateMany).toHaveBeenCalledWith({
      where: { id: 'p-1', organizationId: 'c-1' },
      data: { adBudgetLimit: 10000 },
    });
    expect(prisma.agentEvent.updateMany).toHaveBeenCalledWith({
      where: { id: 's-1', organizationId: 'c-1' },
      data: { restoredAt: expect.any(Date) },
    });
  });

  it('rollback skips master_products row when underlying updateMany finds nothing (cross-tenant guard)', async () => {
    const prisma = makePrisma();
    prisma.agentEvent.findMany.mockResolvedValue([
      {
        id: 's-1',
        organizationId: 'c-1',
        recordId: 'p-foreign',
        fieldName: 'adBudgetLimit',
        valueBefore: 10000,
      },
    ]);
    prisma.masterProduct.updateMany.mockResolvedValue({ count: 0 });

    const service = new SnapshotService(prisma);
    const result = await service.rollback('r-1', 'c-1');

    expect(result.restored).toBe(0);
    // agentEvent.updateMany should NOT mark restored when product was not actually updated.
    expect(prisma.agentEvent.updateMany).not.toHaveBeenCalled();
  });

  it('getSnapshots scopes to (runId, organizationId)', async () => {
    const prisma = makePrisma();
    prisma.agentEvent.findMany.mockResolvedValue([{ id: 's-1' }]);

    const service = new SnapshotService(prisma);
    await service.getSnapshots('r-1', 'c-1');

    expect(prisma.agentEvent.findMany).toHaveBeenCalledWith({
      where: { runId: 'r-1', organizationId: 'c-1', eventType: 'action_snapshot' },
      orderBy: { createdAt: 'asc' },
    });
  });
});
