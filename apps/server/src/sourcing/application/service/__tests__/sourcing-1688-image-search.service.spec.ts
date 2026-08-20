import { describe, expect, it, vi } from 'vitest';
import type { Sourcing1688ImageSearchPort } from '../../port/out/provider/1688-image-search.port';
import type { SourcingCollectionCoordinator } from '../sourcing-collection-coordinator.service';
import { Sourcing1688ImageSearchService } from '../sourcing-1688-image-search.service';
import type { SourcingRecommendationService } from '../sourcing-recommendation.service';

describe('Sourcing1688ImageSearchService', () => {
  it('requires an authorized collection run before image provider IO', async () => {
    const provider: Sourcing1688ImageSearchPort = {
      getStatus: vi.fn(),
      searchByImage: vi.fn(),
    };
    const collection = {
      execute: vi.fn(async () => {
        throw new Error('source_entitlement_missing');
      }),
    } as unknown as SourcingCollectionCoordinator;
    const recommendations = { refresh: vi.fn(async () => undefined) } as unknown as SourcingRecommendationService;
    const service = new Sourcing1688ImageSearchService(provider, collection, recommendations, {} as never);

    await expect(
      service.searchByImage('00000000-0000-4000-8000-000000000001', {
        imageUrl: 'https://cdn.example.com/search.png',
      }),
    ).rejects.toThrow('source_entitlement_missing');
    expect(provider.searchByImage).not.toHaveBeenCalled();
    expect(recommendations.refresh).not.toHaveBeenCalled();
  });

  it('persists trusted image-search offers as keyword observations', async () => {
    const provider: Sourcing1688ImageSearchPort = {
      getStatus: vi.fn(),
      searchByImage: vi.fn(async () => ({
        imageUrl: 'https://cdn.example.com/search.png',
        convertedImageUrl: null,
        items: [
          {
            title: '유아 우산',
            priceCny: 8,
            sourceUrl: 'https://detail.1688.com/offer/607635921546.html?spm=test',
            imageUrl: 'https://cbu01.alicdn.com/umbrella.jpg',
            score: 99,
            salesNum: 32,
            supplierName: '우산 공장',
          },
          {
            title: '신뢰할 수 없는 행',
            priceCny: 1,
            sourceUrl: 'http://localhost:3000/offer/1',
            imageUrl: null,
            score: 1,
          },
        ],
      })),
    };
    let output: unknown;
    const collection = {
      execute: vi.fn(async (_input, producer) => {
        output = await producer({
          permit: {
            runId: '00000000-0000-4000-8000-000000000010',
            organizationId: '00000000-0000-4000-8000-000000000001',
            sourceKey: '1688.image_search',
            scopeKey: 'default',
            targetKey: '유아 우산',
            leaseToken: '00000000-0000-4000-8000-000000000011',
            generation: 1,
            leaseExpiresAt: new Date('2026-08-08T01:00:00.000Z'),
          },
          checkpoint: vi.fn(),
        });
        return {
          kind: 'committed',
          runId: '00000000-0000-4000-8000-000000000010',
          acceptedCount: 1,
          duplicateCount: 0,
          staleDiscardedCount: 0,
        };
      }),
    } as unknown as SourcingCollectionCoordinator;
    const recommendations = { refresh: vi.fn(async () => undefined) } as unknown as SourcingRecommendationService;
    const service = new Sourcing1688ImageSearchService(provider, collection, recommendations, {} as never);

    await service.searchByImage(
      '00000000-0000-4000-8000-000000000001',
      {
        imageUrl: 'https://cdn.example.com/search.png',
        keyword: '유아 우산',
        maxResults: 10,
      },
      '00000000-0000-4000-8000-000000000012',
    );

    expect(collection.execute).toHaveBeenCalledOnce();
    expect(output).toMatchObject({
      discoveredCount: 1,
      rejectedCount: 1,
      typedRecords: [
        {
          kind: 'offer_1688_keyword_observation',
          row: {
            offerId: '607635921546',
            sourceKeyword: '유아 우산',
            sourceUrl: 'https://detail.1688.com/offer/607635921546.html?spm=test',
          },
        },
      ],
    });
    expect(recommendations.refresh).toHaveBeenCalledWith({
      organizationId: '00000000-0000-4000-8000-000000000001',
      limit: 50,
    });
  });

  it('resolves owner targets and passes the operation signal through an atomic image observation', async () => {
    const controller = new AbortController();
    const provider: Sourcing1688ImageSearchPort = {
      getStatus: vi.fn(),
      searchByImage: vi.fn(async (input) => {
        expect(input.signal).toBe(controller.signal);
        return {
          imageUrl: input.imageUrl,
          convertedImageUrl: null,
          items: [{
            title: '필통',
            priceCny: 3,
            sourceUrl: 'https://detail.1688.com/offer/607635921546.html',
            imageUrl: null,
            score: 91,
            supplierTags: ['源头工厂'],
          }],
        };
      }),
    };
    let output: any;
    const collection = {
      execute: vi.fn(async (input, collector) => {
        output = await collector({
          permit: {
            runId: 'collection-run',
            organizationId: input.organizationId,
            sourceKey: input.sourceKey,
            scopeKey: input.scopeKey,
            targetKey: input.targetKey,
            leaseToken: 'lease-token',
            generation: 1,
            leaseExpiresAt: new Date('2026-08-14T00:15:00.000Z'),
          },
          checkpoint: vi.fn(),
        });
        return {
          kind: 'committed', runId: 'collection-run', acceptedCount: 1,
          duplicateCount: 0, staleDiscardedCount: 0,
        };
      }),
    } as unknown as SourcingCollectionCoordinator;
    const searchResults = {
      resolveImageTargets: vi.fn(async () => ({
        targets: [{
          targetId: 'product-1::',
          imageUrl: 'https://thumbnail10.coupangcdn.com/owner.jpg',
          searchQuery: '儿童笔袋文具盒',
        }],
        missingTargetIds: [],
      })),
      findLatest: vi.fn(),
    };
    const service = new Sourcing1688ImageSearchService(
      provider,
      collection,
      { refresh: vi.fn() } as never,
      searchResults as never,
    );

    await expect(service.resolveTargets({
      organizationId: 'org-1',
      targetIds: ['product-1::'],
    })).resolves.toMatchObject({ targets: [{ searchQuery: '儿童笔袋文具盒' }] });
    await expect(service.searchForOperation({
      organizationId: 'org-1',
      operationRunId: 'operation-run',
      actorUserId: 'user-1',
      targetId: 'product-1::',
      imageUrl: 'https://thumbnail10.coupangcdn.com/owner.jpg',
      keyword: '儿童笔袋文具盒',
      signal: controller.signal,
      checkpoint: vi.fn(),
    })).resolves.toMatchObject({
      keyword: '儿童笔袋文具盒',
      targetId: 'product-1::',
      outcome: 'complete',
      accepted: 1,
    });
    expect(output).toMatchObject({
      qualityReport: {
        resultSchemaVersion: 'sourcing-1688-search-result/v1',
        keyword: '儿童笔袋文具盒',
        targetId: 'product-1::',
        operationRunId: 'operation-run',
      },
      typedRecords: [{ row: { searchMetadata: { score: 91, supplierTags: ['源头工厂'] } } }],
    });
  });

  it('reports a provider batch with only disallowed supplier rows as failed', async () => {
    const provider: Sourcing1688ImageSearchPort = {
      getStatus: vi.fn(),
      searchByImage: vi.fn(async (input) => ({
        imageUrl: input.imageUrl,
        convertedImageUrl: null,
        items: [{
          title: 'untrusted offer',
          priceCny: 1,
          sourceUrl: 'http://localhost:3000/offer/1',
          imageUrl: null,
          score: 1,
        }],
      })),
    };
    const collection = {
      execute: vi.fn(async (input, collector) => {
        const output = await collector({
          permit: {
            runId: 'collection-run',
            organizationId: input.organizationId,
            sourceKey: input.sourceKey,
            scopeKey: input.scopeKey,
            targetKey: input.targetKey,
            leaseToken: 'lease-token',
            generation: 1,
            leaseExpiresAt: new Date('2026-08-14T00:15:00.000Z'),
          },
          checkpoint: vi.fn(),
        });
        expect(output).toMatchObject({ discoveredCount: 0, rejectedCount: 1 });
        return {
          kind: 'committed',
          runId: 'collection-run',
          acceptedCount: 0,
          duplicateCount: 0,
          staleDiscardedCount: 0,
        };
      }),
    } as unknown as SourcingCollectionCoordinator;
    const service = new Sourcing1688ImageSearchService(
      provider,
      collection,
      { refresh: vi.fn() } as never,
      { findLatest: vi.fn() } as never,
    );

    await expect(service.searchForOperation({
      organizationId: 'org-1',
      operationRunId: 'operation-run',
      actorUserId: null,
      targetId: 'product-1::',
      imageUrl: 'https://thumbnail10.coupangcdn.com/owner.jpg',
      keyword: '儿童笔袋文具盒',
      signal: new AbortController().signal,
      checkpoint: vi.fn(),
    })).resolves.toMatchObject({ outcome: 'failed', discovered: 1, failed: 1 });
  });

  it('fails closed for an exact image run that is invalid instead of replaying an older target result', async () => {
    const provider: Sourcing1688ImageSearchPort = {
      getStatus: vi.fn(),
      searchByImage: vi.fn(),
    };
    const collection = {
      execute: vi.fn(async () => ({ kind: 'existing' as const, runId: 'current-image-run' })),
    } as unknown as SourcingCollectionCoordinator;
    const searchResults = {
      findLatest: vi.fn(async () => ({
        generatedAt: new Date(),
        observations: [{
          keyword: 'older keyword',
          targetId: 'product-1::',
          capturedAt: new Date(),
          items: [],
        }],
      })),
      findCompletedImageRun: vi.fn(async () => null),
    };
    const service = new Sourcing1688ImageSearchService(
      provider,
      collection,
      { refresh: vi.fn() } as never,
      searchResults as never,
    );

    await expect(service.searchForOperation({
      organizationId: 'org-1',
      operationRunId: 'operation-current',
      actorUserId: null,
      targetId: 'product-1::',
      imageUrl: 'https://thumbnail10.coupangcdn.com/owner.jpg',
      keyword: '儿童笔袋文具盒',
      signal: new AbortController().signal,
      checkpoint: vi.fn(),
    })).rejects.toThrow('Completed image search result is unavailable.');

    expect(provider.searchByImage).not.toHaveBeenCalled();
    expect(searchResults.findCompletedImageRun).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      runId: 'current-image-run',
      operationRunId: 'operation-current',
      targetId: 'product-1::',
      keyword: '儿童笔袋文具盒',
    }));
    expect(searchResults.findLatest).not.toHaveBeenCalled();
  });
});
