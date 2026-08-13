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
    findLatest: vi.fn(async (): Promise<unknown> => null),
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

  it('binds a durable caller idempotency key into the immutable recommendation manifest', async () => {
    const { service, runs, sources } = createService();

    await service.refresh({
      organizationId: ORGANIZATION_ID,
      limit: 50,
      idempotencyKey: 'wing-operation:run-1:recommendation-refresh',
    });
    sources.listLatestOfferObservations.mockResolvedValueOnce({
      rejectedCount: 0,
      items: [],
    });
    await service.refresh({
      organizationId: ORGANIZATION_ID,
      limit: 50,
      idempotencyKey: 'wing-operation:run-1:recommendation-refresh',
    });
    await service.refresh({
      organizationId: ORGANIZATION_ID,
      limit: 50,
      idempotencyKey: 'wing-operation:run-2:recommendation-refresh',
    });

    const [first, repeated, different] = runs.createOrGet.mock.calls.map(([command]) => command);
    expect(first.inputManifestHash).toBe(repeated.inputManifestHash);
    expect(first.inputManifestHash).not.toBe(different.inputManifestHash);
    expect(first.inputManifest).toMatchObject({
      refreshIdempotencyKey: 'wing-operation:run-1:recommendation-refresh',
    });
  });

  it('keeps Coupang demand on Home/Today and exact 1688 offers on Entry/Final', async () => {
    const { service, runs } = createService();
    runs.findLatest.mockResolvedValue({
      id: RUN_ID,
      organizationId: ORGANIZATION_ID,
      inputManifestHash: 'a'.repeat(64),
      status: 'partial',
      businessDate: new Date('2026-08-10T00:00:00.000Z'),
      generatedAt: new Date('2026-08-10T01:00:00.000Z'),
      completedAt: new Date('2026-08-10T01:00:00.000Z'),
      expiresAt: null,
      warningCodes: [],
      items: [
        {
          id: '00000000-0000-4000-8000-000000000031',
          itemKey: 'a'.repeat(64),
          sourcePlatform: '1688',
          externalOfferId: '607635921546',
          variantKeyNormalized: '',
          matchedCoupangProductId: null,
          displayName: '유아 우산',
          rank: 1,
          score: 23,
          grade: 'WATCH',
          baselineAction: 'exclude',
          reasonCodes: [],
          riskCodes: [],
          scoreComponents: {},
          sourceSnapshot: {
            keyword: '유아 우산',
            offerObservationIds: ['00000000-0000-4000-8000-000000000020'],
          },
          evidenceObservationIds: [],
        },
        {
          id: '00000000-0000-4000-8000-000000000032',
          itemKey: 'b'.repeat(64),
          sourcePlatform: 'coupang',
          externalOfferId: '123456',
          variantKeyNormalized: '',
          matchedCoupangProductId: '123456',
          displayName: '쿠팡 유아 우산',
          rank: 2,
          score: 72,
          grade: 'B',
          baselineAction: 'observe_3d',
          reasonCodes: [],
          riskCodes: [],
          scoreComponents: {},
          sourceSnapshot: {
            productId: '123456',
            productName: '쿠팡 유아 우산',
            salePriceKrw: 19900,
          },
          evidenceObservationIds: [],
        },
      ],
    } as never);

    const [home, today, entry, final] = await Promise.all([
      service.latest({ organizationId: ORGANIZATION_ID, surface: 'home' }),
      service.latest({ organizationId: ORGANIZATION_ID, surface: 'today' }),
      service.latest({ organizationId: ORGANIZATION_ID, surface: 'entry' }),
      service.latest({ organizationId: ORGANIZATION_ID, surface: 'final' }),
    ]);

    expect(home.data?.items.map((item) => item.sourcePlatform)).toEqual(['coupang']);
    expect(today.data?.items.map((item) => item.sourcePlatform)).toEqual(['coupang']);
    expect(entry.data?.items.map((item) => item.sourcePlatform)).toEqual(['1688']);
    expect(final.data?.items.map((item) => item.sourcePlatform)).toEqual(['1688']);
  });

  it('preserves each source when another source fills the surface limit', async () => {
    const { service, sources, runs } = createService();
    sources.listLatestCoupangObservations.mockResolvedValue({
      rejectedCount: 0,
      items: [
        {
          evidenceObservationId: '00000000-0000-4000-8000-000000000051',
          productId: '123456',
          itemId: null,
          vendorItemId: null,
          productName: '쿠팡 유아 우산',
          sourceKeyword: '유아 우산',
          salePriceKrw: 19_900,
          ratingCount: 10_000,
          ratingAverage: 5,
          viewsLast28d: 100_000,
          salesLast28d: 10_000,
          capturedAt: new Date('2026-08-10T00:00:00.000Z'),
        },
      ],
    });

    const refreshed = await service.refresh({ organizationId: ORGANIZATION_ID, limit: 1 });

    expect(runs.createOrGet.mock.calls[0][0].items.map((item) => item.sourcePlatform)).toEqual([
      'coupang',
      '1688',
    ]);
    expect(refreshed.data?.items.map((item) => item.sourcePlatform)).toEqual(['1688']);
  });
});
