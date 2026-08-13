import { describe, expect, it, vi } from 'vitest';
import { SourcingWingCatalogIngestService } from '../sourcing-wing-catalog-ingest.service';
import type { SourcingCollectionCoordinator } from '../sourcing-collection-coordinator.service';
import type { SourcingRecommendationService } from '../sourcing-recommendation.service';
import type { OperationAttemptVerifierPort } from '../../../../operations/application/port/in/operation-attempt-verifier.port';
import type { SourcingRecommendationSourceRepositoryPort } from '../../port/out/repository/sourcing-recommendation-source.repository.port';
import type { SourcingRecommendationRepositoryPort } from '../../port/out/repository/sourcing-recommendation.repository.port';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const RUN_ID = '00000000-0000-4000-8000-000000000010';
const ATTEMPT_TOKEN = '00000000-0000-4000-8000-000000000011';
const FINALIZE_MARKER_ID = '00000000-0000-4000-8000-000000000030';
const FINALIZE_LEASE_TOKEN = '00000000-0000-4000-8000-000000000031';

function verifier(
  purpose = 'catalog_search',
  keywords: string[] = ['  슬라임 '],
): OperationAttemptVerifierPort {
  const context = {
    runId: RUN_ID,
    organizationId: ORGANIZATION_ID,
    operationKey: 'sourcing.collect_wing_catalog_batch',
    input: { keywords, maxPages: 2, purpose },
    requestedByUserId: USER_ID,
    startedAt: new Date('2026-08-14T00:00:00.000Z'),
    leaseExpiresAt: new Date('2026-08-14T00:01:00.000Z'),
    deadlineAt: new Date('2026-08-14T00:15:00.000Z'),
  };
  return {
    verifyActiveBrowserAttempt: vi.fn(async () => context),
    withActiveBrowserAttemptFence: vi.fn(async (_input, operation) =>
      operation(context, {})),
  };
}

function recommendationRuns(): SourcingRecommendationRepositoryPort {
  return {
    findById: vi.fn(),
    findLatest: vi.fn(),
    createOrGet: vi.fn(),
    publishStagedRunInAttempt: vi.fn(async () => 'published'),
  } as unknown as SourcingRecommendationRepositoryPort;
}

function sources(
  items: Awaited<ReturnType<SourcingRecommendationSourceRepositoryPort['listWingCatalogSnapshot']>>['items'] = [],
): SourcingRecommendationSourceRepositoryPort {
  return {
    listLatestOfferObservations: vi.fn(async () => ({ items: [], rejectedCount: 0 })),
    listLatestCoupangObservations: vi.fn(async () => ({ items: [], rejectedCount: 0 })),
    listWingCatalogSnapshot: vi.fn(async () => ({
      generatedAt: new Date('2026-08-14T00:00:00.000Z'),
      items,
      rejectedCount: 0,
    })),
  };
}

function durableFinalizeRepository() {
  let state: 'idle' | 'collecting' | 'failed' | 'complete' = 'idle';
  let generation = 0;
  let permit = {
    runId: FINALIZE_MARKER_ID,
    organizationId: ORGANIZATION_ID,
    sourceKey: 'coupang.wing_catalog',
    scopeKey: 'default',
    targetKey: `finalize:${RUN_ID}`,
    leaseToken: FINALIZE_LEASE_TOKEN,
    generation,
    leaseExpiresAt: new Date(Date.now() + 60_000),
  };
  return {
    claimAuthorizedRunInAttempt: vi.fn(async (_transaction, input) => ({
      kind: 'claimed' as const,
      permit: {
        ...permit,
        runId: '00000000-0000-4000-8000-000000000020',
        targetKey: input.targetKey,
      },
    })),
    claimRecoverableRunInAttempt: vi.fn(async () => {
      if (state === 'complete') return { kind: 'completed' as const, runId: FINALIZE_MARKER_ID };
      if (state === 'collecting') {
        return {
          kind: 'in_progress' as const,
          runId: FINALIZE_MARKER_ID,
          leaseExpiresAt: permit.leaseExpiresAt,
        };
      }
      state = 'collecting';
      generation += 1;
      permit = {
        ...permit,
        runId: FINALIZE_MARKER_ID,
        leaseToken: `${FINALIZE_LEASE_TOKEN.slice(0, -1)}${generation}`,
        generation,
        leaseExpiresAt: new Date(Date.now() + 60_000),
      };
      return { kind: 'claimed' as const, permit };
    }),
    commitInAttempt: vi.fn(async (_transaction, input) => {
      if (input.permit.runId === FINALIZE_MARKER_ID) state = 'complete';
      return {
        kind: 'committed' as const,
        runId: input.permit.runId,
        acceptedCount: input.output.discoveredCount,
        duplicateCount: 0,
        staleDiscardedCount: 0,
      };
    }),
    claimRecoverableRun: vi.fn(async () => {
      if (state === 'complete') return { kind: 'completed' as const, runId: FINALIZE_MARKER_ID };
      if (state === 'collecting') {
        return {
          kind: 'in_progress' as const,
          runId: FINALIZE_MARKER_ID,
          leaseExpiresAt: permit.leaseExpiresAt,
        };
      }
      state = 'collecting';
      generation += 1;
      permit = {
        ...permit,
        leaseToken: `${FINALIZE_LEASE_TOKEN.slice(0, -1)}${generation}`,
        generation,
        leaseExpiresAt: new Date(Date.now() + 60_000),
      };
      return { kind: 'claimed' as const, permit };
    }),
    commit: vi.fn(async () => {
      state = 'complete';
      return {
        kind: 'committed' as const,
        runId: FINALIZE_MARKER_ID,
        acceptedCount: 0,
        duplicateCount: 0,
        staleDiscardedCount: 0,
      };
    }),
    fail: vi.fn(async () => {
      state = 'failed';
    }),
    state: () => state,
  };
}

function finalizationInput(purpose: 'catalog_search' | 'recommendation_validation') {
  return {
    organizationId: ORGANIZATION_ID,
    operationRunId: RUN_ID,
    attemptToken: ATTEMPT_TOKEN,
    finalization: {
      purpose,
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
      durableFinalizeRepository() as never,
      recommendationRuns(),
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
    const repository = durableFinalizeRepository();
    const service = new SourcingWingCatalogIngestService(
      coordinator,
      recommendations,
      attemptVerifier,
      sources(),
      repository as never,
      recommendationRuns(),
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

    expect(attemptVerifier.withActiveBrowserAttemptFence).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      runId: RUN_ID,
      expectedOperationKey: 'sourcing.collect_wing_catalog_batch',
      attemptToken: ATTEMPT_TOKEN,
    }, expect.any(Function));
    expect(repository.claimAuthorizedRunInAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        targetKey: 'keyword:슬라임',
        idempotencyKey: expect.stringMatching(new RegExp(`^wing-operation:${RUN_ID}:`)),
        triggerKind: 'extension',
        triggeredByUserId: USER_ID,
      }),
    );
    expect(repository.commitInAttempt.mock.calls[0]?.[1]?.output).toMatchObject({
      observations: [{
        organizationId: ORGANIZATION_ID,
        sourceKey: 'coupang.wing_catalog',
        schemaVersion: 'coupang-wing-catalog/v2',
        rawPayload: expect.objectContaining({ productId: '123', itemName: '기본' }),
      }],
    });
    expect(recommendations.refresh).not.toHaveBeenCalled();
    expect(coordinator.execute).not.toHaveBeenCalled();
  });

  it('uses the shared case-insensitive keyword identity for ingest idempotency', async () => {
    const coordinator = { execute: vi.fn() } as unknown as SourcingCollectionCoordinator;
    const repository = durableFinalizeRepository();
    const service = new SourcingWingCatalogIngestService(
      coordinator,
      { refresh: vi.fn() } as unknown as SourcingRecommendationService,
      verifier('catalog_search', ['Ａ  Pencil']),
      sources(),
      repository as never,
      recommendationRuns(),
    );
    const batch = {
      keyword: 'a pencil',
      maxPages: 2,
      purpose: 'catalog_search' as const,
      items: [],
    };

    await service.ingestBrowserBatch({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch,
    });
    await service.ingestBrowserBatch({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      batch: { ...batch, keyword: '  Ａ   PENCIL ' },
    });

    const executeInputs = repository.claimAuthorizedRunInAttempt.mock.calls
      .map((call) => call[1]);
    expect(executeInputs).toHaveLength(2);
    expect(new Set(executeInputs.map((input) => input.idempotencyKey)).size).toBe(1);
    expect(new Set(executeInputs.map((input) => input.requestHash)).size).toBe(1);
    expect(executeInputs.map((input) => input.targetKey)).toEqual([
      'keyword:a pencil',
      'keyword:a pencil',
    ]);
  });

  it('resumes a durable recommendation refresh after rejection in a later service instance', async () => {
    let calls = 0;
    const coordinator = {
      execute: vi.fn(async () => {
        calls += 1;
        return calls === 1
          ? { kind: 'committed', runId: FINALIZE_MARKER_ID, acceptedCount: 0, duplicateCount: 0, staleDiscardedCount: 0 }
          : { kind: 'existing', runId: FINALIZE_MARKER_ID };
      }),
    } as unknown as SourcingCollectionCoordinator;
    const failedRecommendations = {
      refresh: vi.fn(async () => { throw new Error('refresh crashed'); }),
    } as unknown as SourcingRecommendationService;
    const repository = durableFinalizeRepository();
    const firstService = new SourcingWingCatalogIngestService(
      coordinator,
      failedRecommendations,
      verifier('recommendation_validation'),
      sources(),
      repository as never,
      recommendationRuns(),
    );

    await expect(firstService.finalizeBrowserOperation(
      finalizationInput('recommendation_validation'),
    )).rejects.toThrow('refresh crashed');
    expect(repository.state()).toBe('failed');

    const resumedRecommendations = {
      refresh: vi.fn(async () => ({
        status: 'ready',
        data: { runId: FINALIZE_MARKER_ID },
      })),
    } as unknown as SourcingRecommendationService;
    const resumedService = new SourcingWingCatalogIngestService(
      coordinator,
      resumedRecommendations,
      verifier('recommendation_validation'),
      sources(),
      repository as never,
      recommendationRuns(),
    );

    await expect(resumedService.finalizeBrowserOperation(
      finalizationInput('recommendation_validation'),
    )).resolves.toMatchObject({ finalized: true, refreshed: true });

    expect(repository.fail).toHaveBeenCalledTimes(1);
    expect(repository.commitInAttempt).toHaveBeenCalledTimes(1);
    expect(resumedRecommendations.refresh).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      limit: 50,
      idempotencyKey: `wing-operation:${RUN_ID}:recommendation-refresh`,
      deferPublication: true,
    });
    expect(repository.claimRecoverableRunInAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targetKey: `finalize:${RUN_ID}`,
        idempotencyKey: `wing-operation:${RUN_ID}:finalize`,
      }),
    );
  });

  it('serializes concurrent finalize refreshes and returns success only after durable completion', async () => {
    const coordinator = { execute: vi.fn() } as unknown as SourcingCollectionCoordinator;
    const repository = durableFinalizeRepository();
    let releaseRefresh!: () => void;
    const refreshPending = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    const recommendations = {
      refresh: vi.fn(async () => {
        await refreshPending;
        return { status: 'ready', data: { runId: FINALIZE_MARKER_ID } };
      }),
    } as unknown as SourcingRecommendationService;
    const service = new SourcingWingCatalogIngestService(
      coordinator,
      recommendations,
      verifier('recommendation_validation'),
      sources(),
      repository as never,
      recommendationRuns(),
    );

    const first = service.finalizeBrowserOperation(finalizationInput('recommendation_validation'));
    await vi.waitFor(() => expect(recommendations.refresh).toHaveBeenCalledTimes(1));
    let secondSettled = false;
    const second = service.finalizeBrowserOperation(finalizationInput('recommendation_validation'))
      .finally(() => { secondSettled = true; });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(secondSettled).toBe(false);
    expect(recommendations.refresh).toHaveBeenCalledTimes(1);
    releaseRefresh();

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(recommendations.refresh).toHaveBeenCalledTimes(1);
    expect(repository.commitInAttempt).toHaveBeenCalledTimes(1);
  });

  it('does not rerun a completed refresh and finalizes non-refresh purposes without refresh', async () => {
    const coordinator = { execute: vi.fn() } as unknown as SourcingCollectionCoordinator;
    const repository = durableFinalizeRepository();
    const recommendations = {
      refresh: vi.fn(async () => ({
        status: 'ready',
        data: { runId: FINALIZE_MARKER_ID },
      })),
    } as unknown as SourcingRecommendationService;
    const recommendationService = new SourcingWingCatalogIngestService(
      coordinator,
      recommendations,
      verifier('recommendation_validation'),
      sources(),
      repository as never,
      recommendationRuns(),
    );

    await recommendationService.finalizeBrowserOperation(
      finalizationInput('recommendation_validation'),
    );
    await expect(recommendationService.finalizeBrowserOperation(
      finalizationInput('recommendation_validation'),
    )).resolves.toMatchObject({ finalized: true, duplicate: true });
    expect(recommendations.refresh).toHaveBeenCalledTimes(1);

    const noRefreshRepository = durableFinalizeRepository();
    const noRefreshService = new SourcingWingCatalogIngestService(
      coordinator,
      recommendations,
      verifier('catalog_search'),
      sources(),
      noRefreshRepository as never,
      recommendationRuns(),
    );
    await expect(noRefreshService.finalizeBrowserOperation(
      finalizationInput('catalog_search'),
    )).resolves.toMatchObject({ finalized: true, refreshed: false });
    expect(recommendations.refresh).toHaveBeenCalledTimes(1);
    expect(noRefreshRepository.commitInAttempt).toHaveBeenCalledTimes(1);
  });

  it('rejects final keyword results that reorder the durable operation input', async () => {
    const repository = durableFinalizeRepository();
    const service = new SourcingWingCatalogIngestService(
      { execute: vi.fn() } as unknown as SourcingCollectionCoordinator,
      { refresh: vi.fn() } as unknown as SourcingRecommendationService,
      verifier('catalog_search', ['Ａ', 'B']),
      sources(),
      repository as never,
      recommendationRuns(),
    );

    await expect(service.finalizeBrowserOperation({
      organizationId: ORGANIZATION_ID,
      operationRunId: RUN_ID,
      attemptToken: ATTEMPT_TOKEN,
      finalization: {
        purpose: 'catalog_search',
        keywords: [
          { keyword: 'b', outcome: 'complete', discovered: 1, accepted: 1, duplicate: 0, failed: 0 },
          { keyword: 'a', outcome: 'complete', discovered: 1, accepted: 1, duplicate: 0, failed: 0 },
        ],
      },
    })).rejects.toThrow('wing_catalog_operation_input_mismatch');
    expect(repository.claimRecoverableRunInAttempt).not.toHaveBeenCalled();
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
      durableFinalizeRepository() as never,
      recommendationRuns(),
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
