import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  canonicalizeSourcingWingCatalogKeyword,
  type Sourcing1688BatchUnitResult,
} from '@kiditem/shared/sourcing';
import { kstBusinessDate } from '../../../common/kst';
import {
  SOURCING_1688_KEYWORD_SEARCH_PORT,
  type Search1688KeywordInput,
  type Search1688KeywordResult,
  type Search1688KeywordStatus,
  type Sourcing1688KeywordSearchPort,
} from '../port/out/provider/1688-keyword-search.port';
import {
  hashCollectionRequest,
  map1688HotProductsToAuthorizedOutput,
  normalizeCollectionTarget,
} from './sourcing-collection-mappers';
import { SourcingCollectionCoordinator } from './sourcing-collection-coordinator.service';
import { SourcingRecommendationService } from './sourcing-recommendation.service';
import {
  SOURCING_1688_KEYWORD_COLLECTOR_KEY,
  SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT,
  SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
  type Sourcing1688SearchResultRepositoryPort,
} from '../port/out/repository/sourcing-1688-search-result.repository.port';

const OPERATION_KEYWORD_RESULT_LIMIT = 6;

@Injectable()
export class Sourcing1688KeywordSearchService {
  constructor(
    @Inject(SOURCING_1688_KEYWORD_SEARCH_PORT)
    private readonly keywordSearch: Sourcing1688KeywordSearchPort,
    private readonly collectionCoordinator: SourcingCollectionCoordinator,
    private readonly recommendations: SourcingRecommendationService,
    @Inject(SOURCING_1688_SEARCH_RESULT_REPOSITORY_PORT)
    private readonly searchResults: Sourcing1688SearchResultRepositoryPort,
  ) {}

  getStatus(): Search1688KeywordStatus {
    return this.keywordSearch.getStatus();
  }

  async searchForOperation(input: {
    organizationId: string;
    operationRunId: string;
    actorUserId: string | null;
    keyword: string;
    signal: AbortSignal;
    checkpoint: () => Promise<void>;
  }): Promise<Sourcing1688BatchUnitResult> {
    const keyword = canonicalizeSourcingWingCatalogKeyword(input.keyword);
    input.signal.throwIfAborted();
    let discovered = 0;
    let rejected = 0;
    const execution = await this.collectionCoordinator.execute(
      {
        organizationId: input.organizationId,
        sourceKey: '1688.hot_product',
        scopeKey: 'default',
        targetKey: normalizeCollectionTarget(keyword),
        idempotencyKey: `1688-keyword-operation:${input.operationRunId}:${hashCollectionRequest(
          normalizeCollectionTarget(keyword),
        )}`,
        requestHash: hashCollectionRequest({
          operationRunId: input.operationRunId,
          keyword,
          maxResults: OPERATION_KEYWORD_RESULT_LIMIT,
        }),
        collectorKey: SOURCING_1688_KEYWORD_COLLECTOR_KEY,
        collectorVersion: SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
        triggerKind: 'manual',
        triggeredByUserId: input.actorUserId,
        leaseDurationMs: 15 * 60_000,
      },
      async ({ permit, checkpoint }) => {
        await checkpoint();
        await input.checkpoint();
        input.signal.throwIfAborted();
        const result = await this.keywordSearch.searchByKeyword({
          keyword,
          page: 1,
          maxResults: OPERATION_KEYWORD_RESULT_LIMIT,
          signal: input.signal,
        });
        discovered = result.items.length;
        const acceptedItems = result.items.filter((item) => item.offerId);
        rejected = result.items.length - acceptedItems.length;
        input.signal.throwIfAborted();
        await input.checkpoint();
        await checkpoint();
        const capturedAt = new Date();
        return map1688HotProductsToAuthorizedOutput({
          permit,
          rows: acceptedItems
            .map((item, index) => ({
              organizationId: input.organizationId,
              businessDate: kstBusinessDate(capturedAt),
              offerId: item.offerId as string,
              sourceKeyword: keyword,
              rank: index + 1,
              title: item.title,
              priceCny: item.priceCny,
              monthlySales: item.monthlySales,
              repurchaseRate: item.repurchaseRate,
              tradeScore: item.tradeScore == null ? null : String(item.tradeScore),
              supplierName: item.supplierName,
              imageUrl: item.imageUrl,
              sourceUrl: item.sourceUrl,
              capturedAt,
              searchMetadata: { score: item.score },
            })),
          rejectedCount: rejected,
          qualityReport: {
            resultSchemaVersion: SOURCING_1688_SEARCH_RESULT_SCHEMA_VERSION,
            keyword,
            targetId: null,
          },
        });
      },
    );
    if (execution.kind === 'existing') {
      const snapshot = await this.searchResults.findLatest({
        organizationId: input.organizationId,
        keywords: [keyword],
      });
      const observation = snapshot.observations.find(
        (candidate) => candidate.targetId === null
          && normalizeCollectionTarget(candidate.keyword) === normalizeCollectionTarget(keyword),
      );
      if (!observation) {
        throw new BadRequestException('Completed keyword search result is unavailable.');
      }
      return {
        keyword,
        targetId: null,
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
      targetId: null,
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

  async searchByKeyword(
    organizationId: string,
    input: Search1688KeywordInput,
    idempotencyKey?: string,
  ): Promise<Search1688KeywordResult> {
    const keyword = input.keyword.trim();
    if (!keyword) {
      throw new BadRequestException('1688 keyword search requires a keyword');
    }

    let result: Search1688KeywordResult | null = null;
    const capturedAt = new Date();
    const execution = await this.collectionCoordinator.execute(
      {
        organizationId,
        sourceKey: '1688.hot_product',
        scopeKey: 'default',
        targetKey: normalizeCollectionTarget(keyword),
        idempotencyKey: idempotencyKey?.trim() || `keyword-search:${randomUUID()}`,
        requestHash: hashCollectionRequest({ keyword, page: input.page ?? 1, maxResults: input.maxResults ?? null }),
        collectorKey: 'direct-1688-keyword-search',
        collectorVersion: '2026-08-08',
        triggerKind: 'manual',
        triggeredByUserId: null,
        leaseDurationMs: 120_000,
      },
      async ({ permit, checkpoint }) => {
        await checkpoint();
        const providerResult = await this.keywordSearch.searchByKeyword({
          keyword,
          page: input.page,
          maxResults: input.maxResults,
        });
        result = providerResult;
        await checkpoint();
        return map1688HotProductsToAuthorizedOutput({
          permit,
          rows: providerResult.items
            .filter((item) => item.offerId)
            .map((item, index) => ({
              organizationId,
              businessDate: kstBusinessDate(capturedAt),
              offerId: item.offerId as string,
              sourceKeyword: keyword,
              rank: index + 1,
              title: item.title,
              priceCny: item.priceCny,
              monthlySales: item.monthlySales,
              repurchaseRate: item.repurchaseRate,
              tradeScore: item.tradeScore == null ? null : String(item.tradeScore),
              supplierName: item.supplierName,
              imageUrl: item.imageUrl,
              sourceUrl: item.sourceUrl,
              capturedAt,
            })),
          qualityReport: { source: 'direct-keyword-search', page: providerResult.page },
        });
      },
    );
    if (execution.kind === 'committed') {
      await this.recommendations.refresh({ organizationId, limit: 50 });
    }
    if (!result) {
      throw new BadRequestException('An idempotent keyword search is already in progress.');
    }
    return result;
  }
}
