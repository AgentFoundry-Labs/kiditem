import { describe, expect, it, vi } from 'vitest';
import type { Sourcing1688ImageSearchPort } from '../../port/out/provider/1688-image-search.port';
import type { SourcingCollectionCoordinator } from '../sourcing-collection-coordinator.service';
import { Sourcing1688ImageSearchService } from '../sourcing-1688-image-search.service';

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
    const service = new Sourcing1688ImageSearchService(provider, collection);

    await expect(
      service.searchByImage('00000000-0000-4000-8000-000000000001', {
        imageUrl: 'https://cdn.example.com/search.png',
      }),
    ).rejects.toThrow('source_entitlement_missing');
    expect(provider.searchByImage).not.toHaveBeenCalled();
  });
});
