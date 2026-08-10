import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { kstBusinessDate } from '../../../common/kst';
import {
  extractSupplierOfferId,
  parseAllowedSupplierUrl,
} from '../../domain/supplier-source-url-policy';
import {
  SOURCING_1688_IMAGE_SEARCH_PORT,
  type Search1688ImageInput,
  type Search1688ImageResult,
  type Search1688ImageStatus,
  type Sourcing1688ImageSearchPort,
} from '../port/out/provider/1688-image-search.port';
import {
  hashCollectionRequest,
  map1688HotProductsToAuthorizedOutput,
  normalizeCollectionTarget,
} from './sourcing-collection-mappers';
import { SourcingCollectionCoordinator } from './sourcing-collection-coordinator.service';
import { SourcingRecommendationService } from './sourcing-recommendation.service';

@Injectable()
export class Sourcing1688ImageSearchService {
  constructor(
    @Inject(SOURCING_1688_IMAGE_SEARCH_PORT)
    private readonly imageSearch: Sourcing1688ImageSearchPort,
    private readonly collectionCoordinator: SourcingCollectionCoordinator,
    private readonly recommendations: SourcingRecommendationService,
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
    const capturedAt = new Date();
    let result: Search1688ImageResult | null = null;
    const execution = await this.collectionCoordinator.execute(
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
      async ({ permit, checkpoint }) => {
        await checkpoint();
        const providerResult = await this.imageSearch.searchByImage({
          imageUrl,
          keyword,
          maxResults: input.maxResults,
        });
        result = providerResult;
        await checkpoint();
        let rejectedCount = 0;
        const sourceKeyword = keyword ?? `image:${hashCollectionRequest(imageUrl).slice(0, 16)}`;
        const rows = providerResult.items.flatMap((item, index) => {
          try {
            const supplier = parseAllowedSupplierUrl(item.sourceUrl);
            const offerId = extractSupplierOfferId(supplier);
            if (!offerId) {
              rejectedCount += 1;
              return [];
            }
            return [
              {
                organizationId,
                businessDate: kstBusinessDate(capturedAt),
                offerId,
                sourceKeyword,
                rank: index + 1,
                title: item.title,
                priceCny: item.priceCny,
                monthlySales: item.salesNum ?? null,
                repurchaseRate: item.repurchaseRate ?? null,
                tradeScore: item.serviceScore == null ? null : String(item.serviceScore),
                supplierName: item.supplierName ?? null,
                imageUrl: item.imageUrl,
                sourceUrl: supplier.normalizedUrl,
                capturedAt,
              },
            ];
          } catch {
            rejectedCount += 1;
            return [];
          }
        });
        return map1688HotProductsToAuthorizedOutput({
          permit,
          rows,
          rejectedCount,
          qualityReport: {
            source: 'direct-image-search',
            resultCount: providerResult.items.length,
          },
        });
      },
    );
    if (execution.kind === 'committed') {
      await this.recommendations.refresh({ organizationId, limit: 50 });
    }
    if (!result) {
      throw new BadRequestException('An idempotent image search is already in progress.');
    }
    return result;
  }
}
