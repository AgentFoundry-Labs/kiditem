import { describe, expect, it, vi } from 'vitest';
import { SourcingReviewController } from '../sourcing-review.controller';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const RUN_ID = '00000000-0000-4000-8000-000000000003';
const ITEM_KEY = 'a'.repeat(64);

describe('SourcingReviewController', () => {
  it('uses authenticated organization/user and the path item key for mutation', async () => {
    const updatedAt = new Date('2026-08-10T01:02:03.000Z');
    const createdAt = new Date('2026-08-10T01:03:04.000Z');
    const validation = { latest: vi.fn(async () => ({ status: 'ready' })), refresh: vi.fn(async () => ({ status: 'ready' })) };
    const review = {
      listSelections: vi.fn(async () => []),
      saveSelection: vi.fn(async () => ({
        id: 'internal-selection-id',
        organizationId: ORGANIZATION_ID,
        workspaceKey: 'entry' as const,
        recommendationRunId: RUN_ID,
        itemKey: ITEM_KEY,
        state: 'selected' as const,
        version: 2,
        updatedAt,
      })),
      createBatch: vi.fn(async () => ({
        id: '00000000-0000-4000-8000-000000000005',
        organizationId: ORGANIZATION_ID,
        requestedByUserId: USER_ID,
        recommendationRunId: RUN_ID,
        status: 'awaiting_procurement_enablement' as const,
        itemCount: 1,
        createdAt,
      })),
      getBatch: vi.fn(),
    };
    const controller = new SourcingReviewController(validation as never, review as never);

    const selection = await controller.saveSelection(
      { itemKey: ITEM_KEY },
      { workspaceKey: 'entry', recommendationRunId: RUN_ID, state: 'selected', expectedVersion: 1 },
      ORGANIZATION_ID,
    );
    const batch = await controller.createBatch(
      { recommendationRunId: RUN_ID, itemKeys: [ITEM_KEY], idempotencyKey: '00000000-0000-4000-8000-000000000004' },
      ORGANIZATION_ID,
      { id: USER_ID } as never,
    );

    expect(review.saveSelection).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      workspaceKey: 'entry',
      recommendationRunId: RUN_ID,
      itemKey: ITEM_KEY,
      state: 'selected',
      expectedVersion: 1,
    });
    expect(review.createBatch).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
    }));
    expect(selection).toEqual({
      workspaceKey: 'entry',
      recommendationRunId: RUN_ID,
      itemKey: ITEM_KEY,
      state: 'selected',
      version: 2,
      updatedAt: updatedAt.toISOString(),
    });
    expect(batch).toEqual({
      id: '00000000-0000-4000-8000-000000000005',
      status: 'awaiting_procurement_enablement',
      itemCount: 1,
      createdAt: createdAt.toISOString(),
    });
  });
});
