import { describe, expect, it, vi } from 'vitest';
import type { Sourcing1688KeywordSearchPort } from '../../port/out/provider/1688-keyword-search.port';
import type { SourcingCollectionCoordinator } from '../sourcing-collection-coordinator.service';
import { Sourcing1688KeywordSearchService } from '../sourcing-1688-keyword-search.service';
import type { SourcingRecommendationService } from '../sourcing-recommendation.service';

const organizationId = '00000000-0000-4000-8000-000000000001';

function coordinator(): SourcingCollectionCoordinator {
  return {
    execute: vi.fn(async (input: any, collector: any) => {
      const output = await collector({
        permit: {
          runId: '00000000-0000-4000-8000-000000000002',
          organizationId: input.organizationId,
          sourceKey: input.sourceKey,
          scopeKey: input.scopeKey,
          targetKey: input.targetKey,
          leaseToken: '00000000-0000-4000-8000-000000000003',
          generation: 1,
          entitlementVersionId: '00000000-0000-4000-8000-000000000004',
          entitlementVersionHash: 'a'.repeat(64),
          leaseExpiresAt: new Date('2026-08-08T01:02:00.000Z'),
        },
        checkpoint: async () => undefined,
      });
      return { kind: 'committed', runId: input.idempotencyKey, acceptedCount: output.discoveredCount, duplicateCount: 0, staleDiscardedCount: 0 };
    }),
  } as unknown as SourcingCollectionCoordinator;
}

describe('Sourcing1688KeywordSearchService', () => {
  it('collects and persists the same provider response through an authorized run', async () => {
    const provider: Sourcing1688KeywordSearchPort = {
      getStatus: vi.fn(),
      searchByKeyword: vi.fn(async () => ({
        keyword: '儿童餐盘',
        page: 1,
        items: [{
          offerId: 'offer-1', title: 'plate', priceCny: 3, sourceUrl: 'https://detail.1688.com/offer/1.html', imageUrl: null,
          monthlySales: 10, tradeScore: null, repurchaseRate: null, supplierName: null, score: 1,
        }],
      })),
    };
    const collection = coordinator();
    const recommendations = { refresh: vi.fn(async () => undefined) } as unknown as SourcingRecommendationService;
    const searchResults = { findLatest: vi.fn() };
    const service = new Sourcing1688KeywordSearchService(provider, collection, recommendations, searchResults as never);

    await expect(service.searchByKeyword(organizationId, { keyword: ' 儿童餐盘 ' })).resolves.toMatchObject({
      keyword: '儿童餐盘',
      items: [{ offerId: 'offer-1' }],
    });
    expect(provider.searchByKeyword).toHaveBeenCalledWith({ keyword: '儿童餐盘', page: undefined, maxResults: undefined });
    expect(collection.execute).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, sourceKey: '1688.hot_product', targetKey: '儿童餐盘' }),
      expect.any(Function),
    );
    expect(recommendations.refresh).toHaveBeenCalledWith({ organizationId, limit: 50 });
  });

  it('passes the operation signal and publishes one atomic idempotent keyword observation before progress', async () => {
    const controller = new AbortController();
    const events: string[] = [];
    const provider: Sourcing1688KeywordSearchPort = {
      getStatus: vi.fn(),
      searchByKeyword: vi.fn(async (input) => {
        events.push('provider');
        expect(input.signal).toBe(controller.signal);
        return {
          keyword: input.keyword,
          page: 1,
          items: [{
            offerId: 'offer-1', title: 'plate', priceCny: 3,
            sourceUrl: 'https://detail.1688.com/offer/1.html', imageUrl: null,
            monthlySales: 10, tradeScore: 4.5, repurchaseRate: '20%',
            supplierName: 'factory', score: 88,
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
          checkpoint: vi.fn(async () => events.push('collection-checkpoint')),
        });
        events.push('commit');
        return {
          kind: 'committed',
          runId: 'collection-run',
          acceptedCount: 1,
          duplicateCount: 0,
          staleDiscardedCount: 0,
        };
      }),
    } as unknown as SourcingCollectionCoordinator;
    const recommendations = { refresh: vi.fn() } as unknown as SourcingRecommendationService;
    const service = new Sourcing1688KeywordSearchService(
      provider,
      collection,
      recommendations,
      { findLatest: vi.fn() } as never,
    );

    await expect(service.searchForOperation({
      organizationId,
      operationRunId: 'operation-run',
      actorUserId: 'user-1',
      keyword: ' 儿童餐盘 ',
      signal: controller.signal,
      checkpoint: vi.fn(async () => events.push('operation-checkpoint')),
    })).resolves.toEqual({
      keyword: '儿童餐盘',
      targetId: null,
      outcome: 'complete',
      discovered: 1,
      accepted: 1,
      duplicate: 0,
      failed: 0,
    });

    expect(collection.execute).toHaveBeenCalledWith(expect.objectContaining({
      organizationId,
      sourceKey: '1688.hot_product',
      collectorKey: 'operation-1688-keyword-search',
      idempotencyKey: expect.stringContaining('operation-run'),
      triggeredByUserId: 'user-1',
    }), expect.any(Function));
    expect(events).toEqual([
      'collection-checkpoint',
      'operation-checkpoint',
      'provider',
      'operation-checkpoint',
      'collection-checkpoint',
      'commit',
    ]);
    expect(output).toMatchObject({
      qualityReport: {
        resultSchemaVersion: 'sourcing-1688-search-result/v1',
        keyword: '儿童餐盘',
        targetId: null,
      },
      typedRecords: [{
        row: {
          sourceKeyword: '儿童餐盘',
          searchMetadata: { score: 88 },
        },
      }],
    });
  });

  it('recovers an idempotent completed unit from the typed snapshot without rerunning Playwright', async () => {
    const provider: Sourcing1688KeywordSearchPort = {
      getStatus: vi.fn(),
      searchByKeyword: vi.fn(),
    };
    const collection = {
      execute: vi.fn(async () => ({ kind: 'existing', runId: 'collection-run' })),
    } as unknown as SourcingCollectionCoordinator;
    const searchResults = {
      findLatest: vi.fn(async () => ({
        generatedAt: new Date(),
        observations: [{
          keyword: '儿童餐盘',
          targetId: null,
          capturedAt: new Date(),
          items: [{ offerId: 'offer-1' }],
        }],
      })),
    };
    const service = new Sourcing1688KeywordSearchService(
      provider,
      collection,
      { refresh: vi.fn() } as never,
      searchResults as never,
    );

    await expect(service.searchForOperation({
      organizationId,
      operationRunId: 'operation-run',
      actorUserId: null,
      keyword: '儿童餐盘',
      signal: new AbortController().signal,
      checkpoint: vi.fn(),
    })).resolves.toMatchObject({
      outcome: 'complete',
      accepted: 0,
      duplicate: 1,
    });
    expect(provider.searchByKeyword).not.toHaveBeenCalled();
  });

  it('reports a provider batch with no persistable offer identity as failed', async () => {
    const provider: Sourcing1688KeywordSearchPort = {
      getStatus: vi.fn(),
      searchByKeyword: vi.fn(async () => ({
        keyword: '儿童餐盘',
        page: 1,
        items: [{
          offerId: null,
          title: 'unidentified offer',
          priceCny: 3,
          sourceUrl: 'https://detail.1688.com/offer/missing.html',
          imageUrl: null,
          monthlySales: null,
          tradeScore: null,
          repurchaseRate: null,
          supplierName: null,
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
    const service = new Sourcing1688KeywordSearchService(
      provider,
      collection,
      { refresh: vi.fn() } as never,
      { findLatest: vi.fn() } as never,
    );

    await expect(service.searchForOperation({
      organizationId,
      operationRunId: 'operation-run',
      actorUserId: null,
      keyword: '儿童餐盘',
      signal: new AbortController().signal,
      checkpoint: vi.fn(),
    })).resolves.toMatchObject({ outcome: 'failed', discovered: 1, failed: 1 });
  });
});
