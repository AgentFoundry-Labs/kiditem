import { describe, expect, it, vi } from 'vitest';
import { SourcingAgentWorkspaceCapabilityService } from '../sourcing-agent-workspace-capability.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const RUN_ID = '00000000-0000-4000-8000-000000000003';
const ITEM_KEY = 'a'.repeat(64);

describe('SourcingAgentWorkspaceCapabilityService', () => {
  it('retrieves stable document IDs and the current corpus input hash', async () => {
    const dependencies = mocks();
    dependencies.rag.retrieveWorkspaceEvidence.mockResolvedValue({
      inputHash: 'b'.repeat(64),
      documentCount: 1,
      documents: [{
        documentId: 'recommendation_run:run-1:item-1',
        title: '실리콘 이유식 식판',
        text: '쿠팡 추천 후보',
        sourceScope: 'recommendation_run',
        sourceDate: '2026-08-10',
        sourceSnapshotId: 'recommendation-run:run-1',
        matchedTerms: ['실리콘'],
        score: 12,
        metadata: {},
      }],
      dataGaps: [],
    });
    const service = createService(dependencies);

    const result = await service.retrieveWorkspaceEvidence({
      organizationId: ORGANIZATION_ID,
      query: '실리콘 이유',
      topK: 6,
      days: 30,
    });

    expect(result.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.documents[0]).toMatchObject({
      documentId: expect.any(String),
      sourceSnapshotId: expect.any(String),
      matchedTerms: expect.any(Array),
    });
  });

  it('inspects an explicit recommendation run without recalculating it', async () => {
    const dependencies = mocks();
    dependencies.recommendations.findById.mockResolvedValue(recommendationRun());
    dependencies.validationRows.listForRun.mockResolvedValue({
      items: [{
        episodeId: 'episode-1',
        checks: [{ checkKey: 'landed_cost', status: 'missing' }],
      }],
      nextCursor: null,
    });
    const service = createService(dependencies);

    await expect(service.inspectRecommendationRun({
      organizationId: ORGANIZATION_ID,
      recommendationRunId: RUN_ID,
    })).resolves.toMatchObject({
      runId: RUN_ID,
      itemCount: 1,
      validation: { itemCount: 1, missingCount: 1 },
    });
    expect(dependencies.recommendations.findLatest).not.toHaveBeenCalled();
  });

  it('passes expected selection versions into the atomic review transaction', async () => {
    const dependencies = mocks();
    dependencies.reviews.createBatch.mockResolvedValue({
      id: 'review-1',
      itemCount: 1,
      status: 'awaiting_procurement_enablement',
    });
    const service = createService(dependencies);

    await service.createReviewBatch({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
      recommendationRunId: RUN_ID,
      workspaceKey: 'final',
      items: [{ itemKey: ITEM_KEY, expectedVersion: 4 }],
      idempotencyKey: 'review-key-1',
    });

    expect(dependencies.reviews.createBatch).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      requestedByUserId: USER_ID,
      recommendationRunId: RUN_ID,
      workspaceKey: 'final',
      expectedSelections: [{ itemKey: ITEM_KEY, expectedVersion: 4 }],
      itemKeys: [ITEM_KEY],
      idempotencyKey: 'review-key-1',
    });
  });
});

function mocks() {
  return {
    rag: { retrieveWorkspaceEvidence: vi.fn() },
    recommendations: { findById: vi.fn(), findLatest: vi.fn() },
    validationRows: { listForRun: vi.fn() },
    validations: { refreshForRun: vi.fn() },
    reviews: { createBatch: vi.fn() },
  };
}

function createService(dependencies: ReturnType<typeof mocks>) {
  return new SourcingAgentWorkspaceCapabilityService(
    dependencies.rag as never,
    dependencies.recommendations as never,
    dependencies.validationRows as never,
    dependencies.validations as never,
    dependencies.reviews as never,
  );
}

function recommendationRun() {
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
    items: [{ itemKey: ITEM_KEY }],
  };
}
