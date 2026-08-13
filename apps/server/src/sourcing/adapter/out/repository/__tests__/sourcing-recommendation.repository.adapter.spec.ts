import { describe, expect, it, vi } from 'vitest';
import { SourcingRecommendationRepositoryAdapter } from '../sourcing-recommendation.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-08-10T00:00:00.000Z');

function command() {
  return {
    organizationId: ORGANIZATION_ID,
    policyKey: 'sourcing_workspace' as const,
    policyVersion: '2026-08-10',
    modelVersion: 'server-owned-v1',
    calculationVersion: '2026-08-10',
    inputManifestHash: 'a'.repeat(64),
    inputManifest: {},
    status: 'complete' as const,
    businessDate: NOW,
    generatedAt: NOW,
    completedAt: NOW,
    expiresAt: null,
    warningCodes: [],
    errorCode: null,
    errorMessage: null,
    items: [
      {
        itemKey: 'b'.repeat(64),
        sourcePlatform: '1688' as const,
        externalOfferId: '607635921546',
        variantKeyNormalized: '',
        matchedCoupangProductId: null,
        displayName: '유아 우산',
        rank: 1,
        score: 80,
        grade: 'A' as const,
        baselineAction: 'order' as const,
        reasonCodes: [],
        riskCodes: [],
        scoreComponents: {},
        sourceSnapshot: {},
        evidenceObservationIds: ['00000000-0000-4000-8000-000000000002'],
      },
    ],
  };
}

describe('SourcingRecommendationRepositoryAdapter', () => {
  it('writes a run, items, and evidence links in one transaction with batch writes', async () => {
    const tx = {
      sourcingRecommendationRun: { create: vi.fn(async () => ({ id: '00000000-0000-4000-8000-000000000010' })) },
      sourcingRecommendationItem: { createMany: vi.fn(async () => ({ count: 1 })) },
      sourcingRecommendationItemEvidence: { createMany: vi.fn(async () => ({ count: 1 })) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx)),
      sourcingRecommendationRun: { findFirst: vi.fn(async () => null) },
    };
    const repository = new SourcingRecommendationRepositoryAdapter(prisma as never);

    const result = await repository.createOrGet(command());

    expect(result.kind).toBe('created');
    expect(tx.sourcingRecommendationItem.createMany).toHaveBeenCalledOnce();
    expect(tx.sourcingRecommendationItemEvidence.createMany).toHaveBeenCalledOnce();
  });
});
