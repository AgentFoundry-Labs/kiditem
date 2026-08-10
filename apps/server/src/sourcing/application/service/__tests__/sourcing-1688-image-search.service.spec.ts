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
    const service = new Sourcing1688ImageSearchService(provider, collection, recommendations);

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
    const service = new Sourcing1688ImageSearchService(provider, collection, recommendations);

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
});
