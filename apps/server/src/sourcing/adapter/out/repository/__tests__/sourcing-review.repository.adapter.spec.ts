import { describe, expect, it, vi } from 'vitest';
import { SourcingReviewRepositoryAdapter } from '../sourcing-review.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const RUN_ID = '00000000-0000-4000-8000-000000000002';
const ITEM_KEY = 'a'.repeat(64);

describe('SourcingReviewRepositoryAdapter', () => {
  it('uses a run-scoped compare-and-swap selection update', async () => {
    const prisma = {
      sourcingReviewSelection: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUnique: vi.fn(async () => selection({ version: 2, state: 'selected' })),
      },
    };
    const repository = new SourcingReviewRepositoryAdapter(prisma as never);

    const result = await repository.saveSelection({
      organizationId: ORGANIZATION_ID,
      recommendationRunId: RUN_ID,
      workspaceKey: 'entry',
      itemKey: ITEM_KEY,
      state: 'selected',
      expectedVersion: 1,
    });

    expect(result).toMatchObject({ kind: 'saved', selection: { version: 2 } });
    expect(prisma.sourcingReviewSelection.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        recommendationRunId: RUN_ID,
        workspaceKey: 'entry',
        itemKey: ITEM_KEY,
        version: 1,
      }),
      data: { state: 'selected', version: { increment: 1 } },
    });
  });

  it('returns an idempotent review batch without any procurement write surface', async () => {
    const batch = batchRow();
    const tx = {
      sourcingReviewBatch: {
        findUnique: vi.fn(async () => batch),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    };
    const repository = new SourcingReviewRepositoryAdapter(prisma as never);

    const result = await repository.createBatch({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: '00000000-0000-4000-8000-000000000003',
      recommendationRunId: RUN_ID,
      itemKeys: [ITEM_KEY],
      idempotencyKey: '00000000-0000-4000-8000-000000000004',
      requestHash: 'b'.repeat(64),
    });

    expect(result).toMatchObject({ kind: 'existing', batch: { itemCount: 1 } });
    expect((tx as Record<string, unknown>)).not.toHaveProperty('procurementTestIntent');
    expect((tx as Record<string, unknown>)).not.toHaveProperty('purchaseOrder');
  });

  it('locks and validates selected item versions inside the batch transaction', async () => {
    const tx = {
      sourcingReviewBatch: { findUnique: vi.fn(async () => null) },
      $queryRaw: vi.fn(async () => [{
        item_key: ITEM_KEY,
        state: 'selected',
        version: 3,
      }]),
      sourcingRecommendationItem: { findMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    };
    const repository = new SourcingReviewRepositoryAdapter(prisma as never);

    const result = await repository.createBatch({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: '00000000-0000-4000-8000-000000000003',
      recommendationRunId: RUN_ID,
      workspaceKey: 'final',
      expectedSelections: [{ itemKey: ITEM_KEY, expectedVersion: 4 }],
      itemKeys: [ITEM_KEY],
      idempotencyKey: 'review-1',
      requestHash: 'b'.repeat(64),
    });

    expect(result).toEqual({ kind: 'selection_conflict', itemKeys: [ITEM_KEY] });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.sourcingRecommendationItem.findMany).not.toHaveBeenCalled();
  });
});

function selection(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    organizationId: ORGANIZATION_ID,
    recommendationRunId: RUN_ID,
    workspaceKey: 'entry',
    itemKey: ITEM_KEY,
    state: 'neutral',
    version: 1,
    updatedAt: new Date('2026-08-10T00:00:00.000Z'),
    ...overrides,
  };
}

function batchRow() {
  return {
    id: '00000000-0000-4000-8000-000000000020',
    organizationId: ORGANIZATION_ID,
    recommendationRunId: RUN_ID,
    requestedByUserId: '00000000-0000-4000-8000-000000000003',
    requestHash: 'b'.repeat(64),
    status: 'awaiting_procurement_enablement',
    createdAt: new Date('2026-08-10T00:00:00.000Z'),
    _count: { items: 1 },
  };
}
