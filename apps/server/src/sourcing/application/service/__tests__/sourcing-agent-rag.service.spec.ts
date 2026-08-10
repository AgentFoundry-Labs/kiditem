import { describe, expect, it, vi } from 'vitest';
import { SourcingAgentRagService } from '../sourcing-agent-rag.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

describe('SourcingAgentRagService', () => {
  it('changes cache input hash for a different recommendation run or interest version on one business date', async () => {
    const snapshots = {
      find: vi.fn(async () => null),
      upsert: vi.fn(async (input) => input),
    };
    const interests = {
      list: vi.fn()
        .mockResolvedValueOnce([interest('interest-1', 1)])
        .mockResolvedValueOnce([interest('interest-1', 2)]),
    };
    const recommendations = {
      findLatest: vi.fn()
        .mockResolvedValueOnce(run('run-1'))
        .mockResolvedValueOnce(run('run-2')),
    };
    const validations = {
      listForRun: vi.fn(async () => ({ items: [validation('episode-1')], nextCursor: null })),
    };
    const service = new SourcingAgentRagService(
      snapshots as never,
      interests as never,
      recommendations as never,
      validations as never,
    );

    await service.query({ organizationId: ORGANIZATION_ID, message: '우산', days: 7 });
    await service.query({ organizationId: ORGANIZATION_ID, message: '우산', days: 7 });

    const inputHashes = snapshots.find.mock.calls.map((call) => call[0].inputHash);
    expect(inputHashes).toHaveLength(2);
    expect(inputHashes[0]).not.toBe(inputHashes[1]);
    expect(snapshots.upsert).toHaveBeenCalledTimes(2);
    expect(snapshots.upsert).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'sourcing_agent_rag',
      projectionVersion: 'sourcing-rag.v3',
      expiresAt: expect.any(Date),
    }));
  });
});

function run(id: string) {
  const now = new Date('2026-08-10T00:00:00.000Z');
  return {
    id,
    organizationId: ORGANIZATION_ID,
    inputManifestHash: 'a'.repeat(64),
    status: 'complete' as const,
    businessDate: now,
    generatedAt: now,
    completedAt: now,
    expiresAt: null,
    warningCodes: [],
    items: [{
      id: '00000000-0000-4000-8000-000000000010',
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
      sourceSnapshot: { keyword: '우산', sourceKeywords: ['우산'] },
      evidenceObservationIds: [],
    }],
  };
}

function interest(id: string, version: number) {
  const now = new Date('2026-08-10T00:00:00.000Z');
  return {
    id,
    organizationId: ORGANIZATION_ID,
    targetKey: 'keyword:우산',
    targetType: 'keyword',
    label: '우산',
    sourceKeys: ['manual'],
    keyword: '우산',
    category: null,
    productId: null,
    itemId: null,
    vendorItemId: null,
    productName: null,
    enabled: true,
    version,
    createdAt: now,
    updatedAt: now,
  };
}

function validation(episodeId: string) {
  return {
    episodeId,
    recommendationRunId: 'run-1',
    itemKey: 'b'.repeat(64),
    displayName: '유아 우산',
    imageUrl: null,
    status: 'blocked' as const,
    score: 80,
    landedCostKrw: null,
    expectedMarginBps: null,
    validUntil: null,
    checks: [],
    updatedAt: new Date('2026-08-10T00:00:00.000Z'),
  };
}
