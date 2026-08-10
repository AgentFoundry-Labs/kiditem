import { describe, expect, it, vi } from 'vitest';
import { SourcingRecommendationService } from '../sourcing-recommendation.service';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const RUN_ID = '00000000-0000-4000-8000-000000000010';

function createService() {
  const sources = {
    listLatestOfferObservations: vi.fn(async () => ({
      rejectedCount: 0,
      items: [
        {
          id: '00000000-0000-4000-8000-000000000020',
          evidenceObservationId: '00000000-0000-4000-8000-000000000021',
          ingestionRunId: '00000000-0000-4000-8000-000000000022',
          businessDate: new Date('2026-08-10T00:00:00.000Z'),
          sourceKeyword: '유아 우산',
          externalOfferId: '607635921546',
          variantKey: '',
          sourceUrl: 'https://detail.1688.com/offer/607635921546.html',
          title: '유아 우산',
          supplierName: '우산 공장',
          imageUrl: null,
          rank: 1,
          priceCny: 8,
          monthlySales: 30,
          capturedAt: new Date('2026-08-10T00:00:00.000Z'),
          rawOffer: {},
        },
      ],
    })),
    listLatestCoupangObservations: vi.fn(async () => ({ items: [], rejectedCount: 0 })),
  };
  const runs = {
    findLatest: vi.fn(async () => null),
    createOrGet: vi.fn(async (command) => ({
      kind: 'created' as const,
      run: {
        id: RUN_ID,
        organizationId: command.organizationId,
        inputManifestHash: command.inputManifestHash,
        status: command.status,
        businessDate: command.businessDate,
        generatedAt: command.generatedAt,
        completedAt: command.completedAt,
        expiresAt: command.expiresAt,
        warningCodes: command.warningCodes,
        items: command.items.map((item, index) => ({
          ...item,
          id: `00000000-0000-4000-8000-00000000003${index}`,
        })),
      },
    })),
  };
  const trends = {
    findPopularKeywordHistory: vi.fn(async () => []),
    listSeeds: vi.fn(async () => []),
  };
  const interests = { list: vi.fn(async () => []) };
  return {
    service: new SourcingRecommendationService(
      sources as never,
      runs as never,
      trends as never,
      interests as never,
    ),
    sources,
    runs,
  };
}

describe('SourcingRecommendationService', () => {
  it('reuses an immutable run for the same input manifest', async () => {
    const { service, runs } = createService();
    const first = await service.refresh({ organizationId: ORGANIZATION_ID, limit: 50 });
    runs.createOrGet.mockImplementationOnce(async (command) => ({
      kind: 'existing' as const,
      run: {
        id: RUN_ID,
        organizationId: command.organizationId,
        inputManifestHash: command.inputManifestHash,
        status: command.status,
        businessDate: command.businessDate,
        generatedAt: command.generatedAt,
        completedAt: command.completedAt,
        expiresAt: command.expiresAt,
        warningCodes: command.warningCodes,
        items: command.items.map((item, index) => ({
          ...item,
          id: `00000000-0000-4000-8000-00000000004${index}`,
        })),
      },
    }));
    const repeated = await service.refresh({ organizationId: ORGANIZATION_ID, limit: 50 });

    expect(first.data?.runId).toBe(RUN_ID);
    expect(repeated.data?.runId).toBe(RUN_ID);
    expect(runs.createOrGet).toHaveBeenCalledTimes(2);
    expect(runs.createOrGet.mock.calls[0][0].inputManifestHash).toBe(
      runs.createOrGet.mock.calls[1][0].inputManifestHash,
    );
    expect(runs.createOrGet.mock.calls[0][0].items).toEqual([
      expect.objectContaining({ externalOfferId: '607635921546' }),
    ]);
    expect(first.data?.items[0]).toEqual(expect.objectContaining({
      displayName: '유아 우산',
      sourceUrl: 'https://detail.1688.com/offer/607635921546.html',
      sourceKeywords: ['유아 우산'],
      offerObservationIds: ['00000000-0000-4000-8000-000000000020'],
    }));
    expect(first.data?.items[0]).not.toHaveProperty('sourceSnapshot');
  });
});
