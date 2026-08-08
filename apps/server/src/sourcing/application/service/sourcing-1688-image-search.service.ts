import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  SOURCING_1688_IMAGE_SEARCH_PORT,
  type Search1688ImageInput,
  type Search1688ImageResult,
  type Search1688ImageStatus,
  type Sourcing1688ImageSearchPort,
} from '../port/out/provider/1688-image-search.port';
import {
  hashCollectionRequest,
  normalizeCollectionTarget,
} from './sourcing-collection-mappers';
import { SourcingCollectionCoordinator } from './sourcing-collection-coordinator.service';

@Injectable()
export class Sourcing1688ImageSearchService {
  constructor(
    @Inject(SOURCING_1688_IMAGE_SEARCH_PORT)
    private readonly imageSearch: Sourcing1688ImageSearchPort,
    private readonly collectionCoordinator: SourcingCollectionCoordinator,
  ) {}

  getStatus(): Search1688ImageStatus {
    return this.imageSearch.getStatus();
  }

  async searchByImage(
    organizationId: string,
    input: Search1688ImageInput,
    idempotencyKey?: string,
  ): Promise<Search1688ImageResult> {
    const imageUrl = input.imageUrl.trim();
    if (!imageUrl) throw new BadRequestException('1688 image search requires an image URL');
    const keyword = input.keyword?.trim() || undefined;
    let result: Search1688ImageResult | null = null;
    await this.collectionCoordinator.execute(
      {
        organizationId,
        sourceKey: '1688.image_search',
        scopeKey: 'default',
        targetKey: normalizeCollectionTarget(keyword || imageUrl),
        idempotencyKey: idempotencyKey?.trim() || `image-search:${randomUUID()}`,
        requestHash: hashCollectionRequest({ imageUrl, keyword, maxResults: input.maxResults ?? null }),
        collectorKey: 'direct-1688-image-search',
        collectorVersion: '2026-08-08',
        triggerKind: 'manual',
        triggeredByUserId: null,
        leaseDurationMs: 120_000,
      },
      async ({ checkpoint }) => {
        await checkpoint();
        const providerResult = await this.imageSearch.searchByImage({
          imageUrl,
          keyword,
          maxResults: input.maxResults,
        });
        result = providerResult;
        await checkpoint();
        return {
          observations: [],
          typedRecords: [],
          discoveredCount: providerResult.items.length,
          rejectedCount: 0,
          qualityReport: {
            source: 'direct-image-search',
            resultCount: providerResult.items.length,
          },
        };
      },
    );
    if (!result) {
      throw new BadRequestException('An idempotent image search is already in progress.');
    }
    return result;
  }
}
