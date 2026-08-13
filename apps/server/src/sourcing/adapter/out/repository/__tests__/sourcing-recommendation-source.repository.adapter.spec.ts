import { describe, expect, it, vi } from 'vitest';
import { SourcingRecommendationSourceRepositoryAdapter } from '../sourcing-recommendation-source.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const CUTOFF_AT = new Date('2026-08-10T00:00:00.000Z');

function createRepository() {
  const prisma = {
    sourcing1688OfferKeywordObservation: { findMany: vi.fn(async () => []) },
    sourcingEvidenceObservation: { findMany: vi.fn(async () => []) },
    sourcingEvidenceIngestionRun: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
    },
  };
  return {
    repository: new SourcingRecommendationSourceRepositoryAdapter(prisma as never),
    prisma,
  };
}

describe('SourcingRecommendationSourceRepositoryAdapter', () => {
  it('reads only terminal, point-in-time admissible 1688 observations', async () => {
    const { repository, prisma } = createRepository();
    prisma.sourcing1688OfferKeywordObservation.findMany.mockResolvedValueOnce([
      {
        id: '00000000-0000-4000-8000-000000000010',
        evidenceObservationId: '00000000-0000-4000-8000-000000000011',
        ingestionRunId: '00000000-0000-4000-8000-000000000012',
        businessDate: CUTOFF_AT,
        sourceKeywordNormalized: '유아 우산',
        externalOfferId: '607635921546',
        variantKeyNormalized: '',
        sourceUrl: 'https://detail.1688.com/offer/607635921546.html',
        title: '유아 우산',
        supplierName: null,
        imageUrl: null,
        rank: 1,
        priceCny: { toString: () => '8.00' },
        monthlySales: 30,
        rawOffer: {},
        capturedAt: CUTOFF_AT,
      },
    ]);

    const result = await repository.listLatestOfferObservations({
      organizationId: ORGANIZATION_ID,
      cutoffAt: CUTOFF_AT,
      lookbackDays: 30,
      limit: 10,
    });

    expect(result).toMatchObject({
      rejectedCount: 0,
      items: [{ externalOfferId: '607635921546', priceCny: 8 }],
    });
    expect(prisma.sourcing1688OfferKeywordObservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          evidenceObservation: expect.objectContaining({
            availableAt: { lte: CUTOFF_AT },
            ingestedAt: { lte: CUTOFF_AT },
            ingestionRun: { status: { in: ['complete', 'partial'] } },
          }),
        }),
      }),
    );
  });

  it('quarantines malformed Wing payloads instead of throwing an org-wide read failure', async () => {
    const { repository, prisma } = createRepository();
    prisma.sourcingEvidenceObservation.findMany.mockResolvedValueOnce([
      {
        id: '00000000-0000-4000-8000-000000000021',
        payload: { productId: 'missing fields' },
      },
    ]);

    const result = await repository.listLatestCoupangObservations({
      organizationId: ORGANIZATION_ID,
      cutoffAt: CUTOFF_AT,
      lookbackDays: 30,
      limit: 10,
    });

    expect(result).toEqual({ items: [], rejectedCount: 1 });
  });

  it('reads one organization-scoped persisted Wing snapshot and parses bounded owner rows', async () => {
    const { repository, prisma } = createRepository();
    prisma.sourcingEvidenceIngestionRun.findFirst
      .mockResolvedValueOnce({
        id: '00000000-0000-4000-8000-000000000040',
        completedAt: new Date('2026-08-14T01:00:00.000Z'),
        qualityReport: {
          source: 'coupang-wing-catalog-finalize',
          snapshots: [{
            keyword: '슬라임',
            batchIdempotencyKey: 'wing-operation:new:slime',
          }],
        },
      })
      .mockResolvedValueOnce({
        id: '00000000-0000-4000-8000-000000000041',
      });
    prisma.sourcingEvidenceObservation.findMany.mockResolvedValueOnce([
      {
        id: '00000000-0000-4000-8000-000000000031',
        payload: {
          productId: '123', itemId: null, vendorItemId: null, productName: '슬라임', itemName: null,
          brandName: null, manufacture: null, categoryHierarchy: null, imagePath: null, salePriceKrw: null,
          ratingAverage: null, ratingCount: null, viewsLast28d: null, salesLast28d: null,
          estimatedRevenue28d: null, conversionRate28d: null, deliveryInfo: null,
          sourceKeyword: '슬라임', capturedAt: '2026-08-14T00:00:00.000Z',
        },
      },
      { id: 'bad', payload: { productId: 'raw-arbitrary-json' } },
    ]);

    await expect(repository.listWingCatalogSnapshot({
      organizationId: ORGANIZATION_ID,
      normalizedKeyword: '슬라임',
      limit: 400,
    })).resolves.toMatchObject({
      generatedAt: new Date('2026-08-14T01:00:00.000Z'),
      items: [{ productId: '123' }],
      rejectedCount: 1,
    });
    expect(prisma.sourcingEvidenceIngestionRun.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        organizationId: ORGANIZATION_ID,
        sourceKey: 'coupang.wing_catalog',
        collectorKey: 'wing-catalog-operation-finalize',
        status: { in: ['complete', 'partial'] },
        completedAt: { not: null },
        qualityReport: {
          path: ['snapshots'],
          array_contains: [{ keyword: '슬라임' }],
        },
      },
      select: { id: true, completedAt: true, qualityReport: true },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
    });
    expect(prisma.sourcingEvidenceIngestionRun.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        organizationId: ORGANIZATION_ID,
        idempotencyKey: 'wing-operation:new:slime',
        status: { in: ['complete', 'partial'] },
      },
      select: { id: true },
    });
    expect(prisma.sourcingEvidenceObservation.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.sourcingEvidenceObservation.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        platform: 'coupang',
        sourceKey: 'coupang.wing_catalog',
        schemaVersion: { in: ['coupang-wing-catalog/v1', 'coupang-wing-catalog/v2'] },
        ingestionRunId: '00000000-0000-4000-8000-000000000041',
        supersededByObservation: null,
      },
      select: { id: true, payload: true },
      orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
      take: 800,
    });
  });

  it('returns a latest persisted empty snapshot without falling back to older rows', async () => {
    const { repository, prisma } = createRepository();
    prisma.sourcingEvidenceIngestionRun.findFirst.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000050',
      completedAt: new Date('2026-08-14T02:00:00.000Z'),
      qualityReport: {
        source: 'coupang-wing-catalog-finalize',
        snapshots: [{
          keyword: '슬라임',
          batchIdempotencyKey: 'wing-operation:empty:slime',
        }],
      },
    }).mockResolvedValueOnce({ id: '00000000-0000-4000-8000-000000000051' });

    await expect(repository.listWingCatalogSnapshot({
      organizationId: ORGANIZATION_ID,
      normalizedKeyword: '슬라임',
      limit: 400,
    })).resolves.toEqual({
      generatedAt: new Date('2026-08-14T02:00:00.000Z'),
      items: [],
      rejectedCount: 0,
    });
    expect(prisma.sourcingEvidenceObservation.findMany).toHaveBeenCalledTimes(1);
  });
});
