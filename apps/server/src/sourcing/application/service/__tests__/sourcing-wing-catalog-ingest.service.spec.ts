import { describe, expect, it, vi } from 'vitest';
import { SourcingWingCatalogIngestService } from '../sourcing-wing-catalog-ingest.service';
import type { SourcingCollectionCoordinator } from '../sourcing-collection-coordinator.service';
import type { SourcingRecommendationService } from '../sourcing-recommendation.service';
import type { OperationAttemptVerifierPort } from '../../../../operations/application/port/in/operation-attempt-verifier.port';
import type { SourcingRecommendationSourceRepositoryPort } from '../../port/out/repository/sourcing-recommendation-source.repository.port';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const RUN_ID = '00000000-0000-4000-8000-000000000010';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000011';

function verifier(purpose = 'catalog_search'): OperationAttemptVerifierPort {
  return {
    verifyActiveBrowserAttempt: vi.fn(async () => ({
      runId: RUN_ID,
      organizationId: ORGANIZATION_ID,
      operationKey: 'sourcing.collect_wing_catalog_batch',
      input: { keywords: ['  슬라임 '], maxPages: 2, purpose },
      requestedByUserId: USER_ID,
      startedAt: new Date('2026-08-14T00:00:00.000Z'),
      leaseExpiresAt: new Date('2026-08-14T00:01:00.000Z'),
      deadlineAt: new Date('2026-08-14T00:15:00.000Z'),
    })),
  };
}

function sources(
  items: Awaited<ReturnType<SourcingRecommendationSourceRepositoryPort['listWingCatalogSnapshot']>>['items'] = [],
): SourcingRecommendationSourceRepositoryPort {
  return {
    listLatestOfferObservations: vi.fn(async () => ({ items: [], rejectedCount: 0 })),
    listLatestCoupangObservations: vi.fn(async () => ({ items: [], rejectedCount: 0 })),
    listWingCatalogSnapshot: vi.fn(async () => ({ items, rejectedCount: 0 })),
  };
}

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
    const service = new SourcingWingCatalogIngestService(
      coordinator,
      recommendations,
      verifier(),
      sources(),
    );

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

  it('fences each browser chunk, derives keyword idempotency, and does not refresh per chunk', async () => {
    let produced: unknown;
    const requestHashes: string[] = [];
    const coordinator = {
      execute: vi.fn(async (executeInput, producer) => {
        requestHashes.push(executeInput.requestHash);
        produced = await producer({
          permit: {
            runId: '00000000-0000-4000-8000-000000000020',
            organizationId: ORGANIZATION_ID,
            sourceKey: 'coupang.wing_catalog',
            scopeKey: 'default',
            targetKey: 'keyword:슬라임',
            leaseToken: '00000000-0000-4000-8000-000000000021',
            generation: 1,
            leaseExpiresAt: new Date('2026-08-14T00:01:00.000Z'),
          },
          checkpoint: vi.fn(),
        });
        return {
          kind: 'committed' as const,
          runId: '00000000-0000-4000-8000-000000000020',
          acceptedCount: 1,
          duplicateCount: 0,
          staleDiscardedCount: 0,
        };
      }),
    } as unknown as SourcingCollectionCoordinator;
    const recommendations = {
      refresh: vi.fn(async () => ({ status: 'ready' })),
    } as unknown as SourcingRecommendationService;
    const attemptVerifier = verifier();
    const service = new SourcingWingCatalogIngestService(
      coordinator,
      recommendations,
      attemptVerifier,
      sources(),
    );

    const browserBatchInput = {
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: {
        keyword: '슬라임',
        maxPages: 2,
        purpose: 'catalog_search',
        items: [{
          productId: '123',
          itemId: null,
          vendorItemId: '456',
          productName: '슬라임 세트',
          itemName: '기본',
          brandName: null,
          manufacture: null,
          categoryHierarchy: '장난감',
          imagePath: 'catalog/example.jpg',
          salePriceKrw: 12_000,
          ratingAverage: 4.5,
          ratingCount: 10,
          viewsLast28d: 100,
          salesLast28d: 20,
          estimatedRevenue28d: 240_000,
          conversionRate28d: 0.2,
          deliveryInfo: '로켓배송',
          sourceKeyword: '슬라임',
          capturedAt: '2026-08-14T00:00:00.000Z',
        }],
      },
    } as const;
    await service.ingestBrowserBatch(browserBatchInput);
    await service.ingestBrowserBatch({
      ...browserBatchInput,
      batch: {
        ...browserBatchInput.batch,
        items: [{
          ...browserBatchInput.batch.items[0],
          capturedAt: '2026-08-14T00:00:01.000Z',
        }],
      },
    });

    expect(attemptVerifier.verifyActiveBrowserAttempt).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      expectedOperationKey: 'sourcing.collect_wing_catalog_batch',
      attemptToken: ATTEMPT_TOKEN,
    });
    expect(coordinator.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        targetKey: 'keyword:슬라임',
        idempotencyKey: expect.stringMatching(new RegExp(`^wing-operation:${RUN_ID}:`)),
        triggerKind: 'extension',
        triggeredByUserId: USER_ID,
      }),
      expect.any(Function),
    );
    expect(produced).toMatchObject({
      observations: [{
        organizationId: ORGANIZATION_ID,
        sourceKey: 'coupang.wing_catalog',
        schemaVersion: 'coupang-wing-catalog/v2',
        rawPayload: expect.objectContaining({ productId: '123', itemName: '기본' }),
      }],
    });
    expect(recommendations.refresh).not.toHaveBeenCalled();
    expect(new Set(requestHashes).size).toBe(1);
  });

  it('durably finalizes once and refreshes recommendations only for the matching purpose', async () => {
    let calls = 0;
    const requestHashes: string[] = [];
    const coordinator = {
      execute: vi.fn(async (executeInput, producer) => {
        requestHashes.push(executeInput.requestHash);
        calls += 1;
        if (calls === 1) {
          await producer({
            permit: {
              runId: '00000000-0000-4000-8000-000000000030',
              organizationId: ORGANIZATION_ID,
              sourceKey: 'coupang.wing_catalog',
              scopeKey: 'default',
              targetKey: `finalize:${RUN_ID}`,
              leaseToken: '00000000-0000-4000-8000-000000000031',
              generation: 1,
              leaseExpiresAt: new Date('2026-08-14T00:01:00.000Z'),
            },
            checkpoint: vi.fn(),
          });
          return { kind: 'committed', runId: 'marker', acceptedCount: 0, duplicateCount: 0, staleDiscardedCount: 0 };
        }
        return { kind: 'existing', runId: 'marker' };
      }),
    } as unknown as SourcingCollectionCoordinator;
    const recommendations = {
      refresh: vi.fn(async () => ({ status: 'ready' })),
    } as unknown as SourcingRecommendationService;
    const service = new SourcingWingCatalogIngestService(
      coordinator,
      recommendations,
      verifier('recommendation_validation'),
      sources(),
    );
    const input = {
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      finalization: {
        purpose: 'recommendation_validation' as const,
        keywords: [{
          keyword: '슬라임',
          outcome: 'complete' as const,
          discovered: 1,
          accepted: 1,
          duplicate: 0,
          failed: 0,
        }],
      },
    };

    await expect(service.finalizeBrowserOperation(input)).resolves.toMatchObject({ finalized: true });
    await expect(service.finalizeBrowserOperation({
      ...input,
      finalization: {
        ...input.finalization,
        keywords: [{
          ...input.finalization.keywords[0],
          outcome: 'no_change' as const,
          accepted: 0,
          duplicate: 1,
        }],
      },
    })).resolves.toMatchObject({ finalized: true });

    expect(recommendations.refresh).toHaveBeenCalledTimes(1);
    expect(new Set(requestHashes).size).toBe(1);
    expect(recommendations.refresh).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, limit: 50 });
    expect(coordinator.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        targetKey: `finalize:${RUN_ID}`,
        idempotencyKey: `wing-operation:${RUN_ID}:finalize`,
      }),
      expect.any(Function),
    );
  });

  it('returns a parsed persisted owner snapshot and rejects a keyword outside the run input', async () => {
    const coordinator = { execute: vi.fn() } as unknown as SourcingCollectionCoordinator;
    const recommendations = { refresh: vi.fn() } as unknown as SourcingRecommendationService;
    const sourceRepository = sources([{
      productId: '123', itemId: null, vendorItemId: null, productName: '슬라임', itemName: null,
      brandName: null, manufacture: null, categoryHierarchy: null, imagePath: null, salePriceKrw: null,
      ratingAverage: null, ratingCount: null, viewsLast28d: null, salesLast28d: null,
      estimatedRevenue28d: null, conversionRate28d: null, deliveryInfo: null,
      sourceKeyword: '슬라임', capturedAt: '2026-08-14T00:00:00.000Z',
    }]);
    const service = new SourcingWingCatalogIngestService(
      coordinator,
      recommendations,
      verifier(),
      sourceRepository,
    );

    await expect(service.snapshot({ organizationId: ORGANIZATION_ID, keyword: ' 슬라임 ' }))
      .resolves.toMatchObject({ keyword: '슬라임', items: [{ productId: '123' }] });
    expect(sourceRepository.listWingCatalogSnapshot).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      normalizedKeyword: '슬라임',
      limit: 400,
    });

    await expect(service.ingestBrowserBatch({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: {
        keyword: '클레이',
        maxPages: 2,
        purpose: 'catalog_search',
        items: [{
          productId: '456', itemId: null, vendorItemId: null, productName: '클레이', itemName: null,
          brandName: null, manufacture: null, categoryHierarchy: null, imagePath: null, salePriceKrw: null,
          ratingAverage: null, ratingCount: null, viewsLast28d: null, salesLast28d: null,
          estimatedRevenue28d: null, conversionRate28d: null, deliveryInfo: null,
          sourceKeyword: '클레이', capturedAt: '2026-08-14T00:00:00.000Z',
        }],
      },
    } as never)).rejects.toThrow('wing_catalog_operation_input_mismatch');

    await expect(service.ingestBrowserBatch({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: {
        keyword: '슬라임',
        maxPages: 2,
        purpose: 'market_analysis',
        items: [],
      },
    })).rejects.toThrow('wing_catalog_operation_input_mismatch');
    expect(coordinator.execute).not.toHaveBeenCalled();
  });
});
