import { describe, expect, it, vi } from 'vitest';
import { SourcingWingCatalogIngestService } from '../sourcing-wing-catalog-ingest.service';
import type { SourcingCollectionCoordinator } from '../sourcing-collection-coordinator.service';
import type { SourcingRecommendationService } from '../sourcing-recommendation.service';

describe('SourcingWingCatalogIngestService', () => {
  it('writes strict Wing rows as immutable demand evidence before refreshing recommendations', async () => {
    let output: unknown;
    const coordinator = {
      execute: vi.fn(async (_input, producer) => {
        output = await producer({
          permit: {
            runId: '00000000-0000-4000-8000-000000000010',
            organizationId: '00000000-0000-4000-8000-000000000001',
            sourceKey: 'coupang.wing_catalog',
            scopeKey: 'default',
            targetKey: 'batch',
            leaseToken: '00000000-0000-4000-8000-000000000011',
            generation: 1,
            leaseExpiresAt: new Date('2026-08-10T01:00:00.000Z'),
          },
          checkpoint: vi.fn(),
        });
        return {
          kind: 'committed' as const,
          runId: '00000000-0000-4000-8000-000000000010',
          acceptedCount: 1,
          duplicateCount: 0,
          staleDiscardedCount: 0,
        };
      }),
    } as unknown as SourcingCollectionCoordinator;
    const recommendations = {
      refresh: vi.fn(async () => ({ status: 'ready' })),
    } as unknown as SourcingRecommendationService;
    const service = new SourcingWingCatalogIngestService(coordinator, recommendations);

    await service.ingest({
      organizationId: '00000000-0000-4000-8000-000000000001',
      actorUserId: '00000000-0000-4000-8000-000000000002',
      idempotencyKey: '00000000-0000-4000-8000-000000000003',
      items: [
        {
          productId: '123',
          itemId: null,
          vendorItemId: '456',
          productName: '유아 우산',
          sourceKeyword: '우산',
          salePriceKrw: 12000,
          ratingCount: 10,
          ratingAverage: 4.5,
          viewsLast28d: 100,
          salesLast28d: 20,
          capturedAt: '2026-08-10T00:00:00.000Z',
        },
      ],
    });

    expect(output).toMatchObject({
      observations: [
        {
          platform: 'coupang',
          evidenceFamily: 'wing_catalog',
          signalRole: 'demand',
          sourceEntityType: 'coupang_product',
          sourceEntityId: '123',
          schemaVersion: 'coupang-wing-catalog/v1',
        },
      ],
    });
    expect(recommendations.refresh).toHaveBeenCalledWith({
      organizationId: '00000000-0000-4000-8000-000000000001',
      limit: 50,
    });
  });
});
