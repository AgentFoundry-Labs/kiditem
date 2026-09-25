import { describe, expect, it, vi } from 'vitest';
import { SourcingRecommendationSourceRepositoryAdapter } from '../sourcing-recommendation-source.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const CUTOFF_AT = new Date('2026-08-10T00:00:00.000Z');

function createRepository() {
  const prisma = {
    sourcing1688OfferKeywordObservation: { findMany: vi.fn(async () => []) },
    sourcingEvidenceObservation: { findMany: vi.fn(async () => []) },
    sourcingWingCatalogProductFact: {
      findMany: vi.fn(async () => []),
      groupBy: vi.fn(async () => []),
    },
    sourcingSourcePublication: {
      findMany: vi.fn(async () => []),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (work) => work(prisma));
  return {
    repository: new SourcingRecommendationSourceRepositoryAdapter(prisma as never),
    prisma,
  };
}

describe('SourcingRecommendationSourceRepositoryAdapter', () => {
  it('reports declared Wing coverage with no typed publication as rejected evidence', async () => {
    const { repository, prisma } = createRepository();
    prisma.sourcingSourcePublication.findMany.mockResolvedValueOnce([{
      operationId: 'complete',
      qualityReport: {
        snapshots: [{ keyword: 'slime' }],
        wingReceipts: [{ count: 1 }],
      },
    }]);

    const result = await repository.listLatestCoupangObservations({
      organizationId: ORGANIZATION_ID,
      cutoffAt: CUTOFF_AT,
      lookbackDays: 30,
      limit: 10,
    });

    expect(result).toEqual({ items: [], rejectedCount: 1 });
    expect(prisma.sourcingEvidenceObservation.findMany).not.toHaveBeenCalled();
  });

});
