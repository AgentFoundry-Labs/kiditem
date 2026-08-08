import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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

@Injectable()
export class Sourcing1688KeywordSearchService {
  constructor(
    @Inject(SOURCING_1688_KEYWORD_SEARCH_PORT)
    private readonly keywordSearch: Sourcing1688KeywordSearchPort,
    private readonly collectionCoordinator: SourcingCollectionCoordinator,
  ) {}

  getStatus(): Search1688KeywordStatus {
    return this.keywordSearch.getStatus();
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
    await this.collectionCoordinator.execute(
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
    if (!result) {
      throw new BadRequestException('An idempotent keyword search is already in progress.');
    }
    return result;
  }
}
