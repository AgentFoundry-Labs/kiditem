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
    },
  };
  return {
    repository: new SourcingRecommendationSourceRepositoryAdapter(prisma as never),
    prisma,
  };
}

describe('SourcingRecommendationSourceRepositoryAdapter', () => {
  it('reads only current COMPLETE, point-in-time admissible 1688 observations', async () => {
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
            ingestionRun: { status: 'COMPLETE', isCurrentComplete: true },
          }),
        }),
      }),
    );
  });

  it('quarantines malformed Wing payloads instead of throwing an org-wide read failure', async () => {
    const { repository, prisma } = createRepository();
    prisma.sourcingEvidenceIngestionRun.findMany.mockResolvedValueOnce([{ id: 'complete', qualityReport: { snapshots: [{ keyword: 'slime' }] } }]);
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

});
