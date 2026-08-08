import { describe, expect, it, vi } from 'vitest';
import type { Sourcing1688KeywordSearchPort } from '../../port/out/provider/1688-keyword-search.port';
import type { SourcingCollectionCoordinator } from '../sourcing-collection-coordinator.service';
import { Sourcing1688KeywordSearchService } from '../sourcing-1688-keyword-search.service';

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
          decisionImpactAtIngest: 'enabled',
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
    const service = new Sourcing1688KeywordSearchService(provider, collection);

    await expect(service.searchByKeyword(organizationId, { keyword: ' 儿童餐盘 ' })).resolves.toMatchObject({
      keyword: '儿童餐盘',
      items: [{ offerId: 'offer-1' }],
    });
    expect(provider.searchByKeyword).toHaveBeenCalledWith({ keyword: '儿童餐盘', page: undefined, maxResults: undefined });
    expect(collection.execute).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, sourceKey: '1688.hot_product', targetKey: '儿童餐盘' }),
      expect.any(Function),
    );
  });
});
