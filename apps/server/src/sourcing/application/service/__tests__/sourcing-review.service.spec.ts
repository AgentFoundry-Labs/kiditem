import { describe, expect, it, vi } from 'vitest';
import { SourcingReviewService } from '../sourcing-review.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const RUN_ID = '00000000-0000-4000-8000-000000000010';
const ITEM_KEY = 'a'.repeat(64);
const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000003';

describe('SourcingReviewService', () => {
  it('returns a version conflict instead of overwriting another selection', async () => {
    const recommendations = { findById: vi.fn(async () => run()), findLatest: vi.fn() };
    const repository = {
      listSelections: vi.fn(),
      saveSelection: vi.fn(async () => ({ kind: 'version_conflict', currentVersion: 3 })),
      createBatch: vi.fn(),
      findBatch: vi.fn(),
    };
    const service = new SourcingReviewService(recommendations as never, repository as never);

    await expect(service.saveSelection({
      organizationId: ORGANIZATION_ID,
      workspaceKey: 'entry',
      recommendationRunId: RUN_ID,
      itemKey: ITEM_KEY,
      state: 'selected',
      expectedVersion: 2,
    })).rejects.toMatchObject({ status: 409 });
  });

  it('creates only a review batch and never receives a procurement dependency', async () => {
    const recommendations = { findById: vi.fn(async () => run()), findLatest: vi.fn() };
    const repository = {
      listSelections: vi.fn(),
      saveSelection: vi.fn(),
      createBatch: vi.fn(async () => ({
        kind: 'created',
        batch: {
          id: '00000000-0000-4000-8000-000000000020',
          organizationId: ORGANIZATION_ID,
          recommendationRunId: RUN_ID,
          requestedByUserId: USER_ID,
          status: 'awaiting_procurement_enablement',
          itemCount: 1,
          createdAt: new Date('2026-08-10T00:00:00.000Z'),
        },
      })),
      findBatch: vi.fn(),
    };
    const service = new SourcingReviewService(recommendations as never, repository as never);

    const result = await service.createBatch({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
      recommendationRunId: RUN_ID,
      itemKeys: [ITEM_KEY],
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(result).toMatchObject({ status: 'awaiting_procurement_enablement', itemCount: 1 });
    expect(repository.createBatch).toHaveBeenCalledTimes(1);
    expect(repository.createBatch).toHaveBeenCalledWith(expect.objectContaining({
      requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });
});

function run() {
  const now = new Date('2026-08-10T00:00:00.000Z');
  return {
    id: RUN_ID,
    organizationId: ORGANIZATION_ID,
    inputManifestHash: 'b'.repeat(64),
    status: 'complete' as const,
    businessDate: now,
    generatedAt: now,
    completedAt: now,
    expiresAt: null,
    warningCodes: [],
    items: [{
      id: '00000000-0000-4000-8000-000000000011',
      itemKey: ITEM_KEY,
      sourcePlatform: '1688' as const,
      externalOfferId: '607635921546',
      variantKeyNormalized: '',
      matchedCoupangProductId: null,
      displayName: '유아 우산',
      rank: 1,
      score: 84,
      grade: 'A' as const,
      baselineAction: 'order' as const,
      reasonCodes: [],
      riskCodes: [],
      scoreComponents: {},
      sourceSnapshot: {
        offerObservationIds: ['00000000-0000-4000-8000-000000000012'],
      },
      evidenceObservationIds: ['00000000-0000-4000-8000-000000000013'],
    }],
  };
}
