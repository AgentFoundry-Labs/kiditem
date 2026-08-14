import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Sourcing1688BatchUnitResult } from '@kiditem/shared/sourcing';
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
import {
  SOURCING_1688_IMAGE_COLLECTOR_KEY,
  SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT,
  SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
  type Sourcing1688SearchResultRepositoryPort,
} from '../port/out/repository/sourcing-1688-search-result.repository.port';

const OPERATION_IMAGE_RESULT_LIMIT = 18;

@Injectable()
export class Sourcing1688ImageSearchService {
  constructor(
    @Inject(SOURCING_1688_IMAGE_SEARCH_PORT)
    private readonly imageSearch: Sourcing1688ImageSearchPort,
    private readonly collectionCoordinator: SourcingCollectionCoordinator,
    private readonly recommendations: SourcingRecommendationService,
    @Inject(SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT)
    private readonly searchResults: Sourcing1688SearchResultRepositoryPort,
  ) {}

  getStatus(): Search1688ImageStatus {
    return this.imageSearch.getStatus();
  }

  resolveTargets(input: {
    organizationId: string;
    targetIds: string[];
  }) {
    return this.searchResults.resolveImageTargets(input);
  }

  async searchForOperation(input: {
    organizationId: string;
    operationRunId: string;
    actorUserId: string | null;
    targetId: string;
    imageUrl: string;
    keyword: string;
    signal: AbortSignal;
    checkpoint: () => Promise<void>;
  }): Promise<Sourcing1688BatchUnitResult> {
    const keyword = input.keyword.trim();
    if (!keyword) throw new BadRequestException('1688 image search requires a keyword');
    input.signal.throwIfAborted();
    let discovered = 0;
    let rejected = 0;
    const execution = await this.collectionCoordinator.execute(
      {
        organizationId: input.organizationId,
        sourceKey: '1688.image_search',
        scopeKey: 'default',
        targetKey: `image-target:${hashCollectionRequest(input.targetId)}`,
        idempotencyKey: `1688-image-operation:${input.operationRunId}:${hashCollectionRequest(
          input.targetId,
        )}`,
        requestHash: hashCollectionRequest({
          operationRunId: input.operationRunId,
          targetId: input.targetId,
          imageUrl: input.imageUrl,
          keyword,
          maxResults: OPERATION_IMAGE_RESULT_LIMIT,
        }),
        collectorKey: SOURCING_1688_IMAGE_COLLECTOR_KEY,
        collectorVersion: SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
        triggerKind: 'manual',
        triggeredByUserId: input.actorUserId,
        leaseDurationMs: 15 * 60_000,
      },
      async ({ permit, checkpoint }) => {
        await checkpoint();
        await input.checkpoint();
        input.signal.throwIfAborted();
        const result = await this.imageSearch.searchByImage({
          imageUrl: input.imageUrl,
          keyword,
          maxResults: OPERATION_IMAGE_RESULT_LIMIT,
          signal: input.signal,
        });
        discovered = result.items.length;
        input.signal.throwIfAborted();
        await input.checkpoint();
        await checkpoint();
        const capturedAt = new Date();
        let rejectedCount = 0;
        const rows = result.items.flatMap((item, index) => {
          try {
            const supplier = parseAllowedSupplierUrl(item.sourceUrl);
            const offerId = extractSupplierOfferId(supplier);
            if (!offerId) {
              rejectedCount += 1;
              return [];
            }
            return [{
              organizationId: input.organizationId,
              businessDate: kstBusinessDate(capturedAt),
              offerId,
              sourceKeyword: keyword,
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
              searchMetadata: {
                score: item.score,
                salesText: item.salesText ?? null,
                supplierFactoryUrl: item.supplierFactoryUrl ?? null,
                supplierTags: item.supplierTags ?? [],
                purchaseTags: item.purchaseTags ?? [],
                minOrderQuantity: item.minOrderQuantity ?? null,
                shippingFulfillmentRate: item.shippingFulfillmentRate ?? null,
                shippingPickupRate: item.shippingPickupRate ?? null,
                shipFrom: item.shipFrom ?? null,
                serviceScore: item.serviceScore ?? null,
              },
            }];
          } catch {
            rejectedCount += 1;
            return [];
          }
        });
        rejected = rejectedCount;
        return map1688HotProductsToAuthorizedOutput({
          permit,
          rows,
          rejectedCount,
          qualityReport: {
            resultSchemaVersion: SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
            keyword,
            targetId: input.targetId,
          },
        });
      },
    );
    if (execution.kind === 'existing') {
      const snapshot = await this.searchResults.findLatest({
        organizationId: input.organizationId,
        targetIds: [input.targetId],
      });
      const observation = snapshot.observations.find(
        (candidate) => candidate.targetId === input.targetId,
      );
      if (!observation) {
        throw new BadRequestException('Completed image search result is unavailable.');
      }
      return {
        keyword: observation.keyword,
        targetId: input.targetId,
        outcome: observation.items.length > 0 ? 'complete' : 'no_change',
        discovered: observation.items.length,
        accepted: 0,
        duplicate: observation.items.length,
        failed: 0,
      };
    }
    const persisted = execution.acceptedCount + execution.duplicateCount;
    const allRejected = discovered > 0 && persisted === 0 && rejected > 0;
    return {
      keyword,
      targetId: input.targetId,
      outcome: allRejected ? 'failed' : discovered > 0 ? 'complete' : 'no_change',
      discovered,
      accepted: execution.acceptedCount,
      duplicate: execution.duplicateCount,
      failed: rejected,
    };
  }

  refreshRecommendations(organizationId: string): Promise<unknown> {
    return this.recommendations.refresh({ organizationId, limit: 50 });
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
