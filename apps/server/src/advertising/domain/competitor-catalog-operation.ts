import { KiditemConflictError, KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';
import {
  COMPETITOR_CATALOG_CHUNK_KIND,
  COMPETITOR_CATALOG_ENRICHMENT_MAX_PRODUCTS,
  COMPETITOR_CATALOG_MAX_PRODUCTS,
  COMPETITOR_CATALOG_MAX_TARGETS,
  CompetitorCatalogItemSchema,
  CompetitorCatalogTargetSchema,
  advertisingKeywordIdentity,
  type CompetitorCatalogItem,
  type CompetitorCatalogPlan,
  type CompetitorCatalogScope,
} from '@kiditem/shared/advertising-operations';
import type { OperationStagedChunk } from '@kiditem/shared/operation';

/**
 * 경쟁사 카탈로그 계획(`advertising.competitor_catalog`, KID-362): 서버 선택(감시 판매자 + 겹침이 큰 확인된 판매자, 20명)을
 * 쓰고, 판매자를 주면 그 판매자 하나만(선택에 없으면 거절). 연쇄 보강이면 판매자마다 상품 500개, 아니면 100개(옛 attempt와 같다).
 * 형식이 맞지 않는 선택 행은 계획에 넣지 않는다.
 */
export function planCompetitorCatalog(input: {
  selected: ReadonlyArray<{ sellerId: string; sellerName: string; sellerStoreUrl: string; keyword: string }>;
  scope: CompetitorCatalogScope;
}): CompetitorCatalogPlan {
  const targets = input.selected
    .map((target) => CompetitorCatalogTargetSchema.safeParse({
      sellerId: target.sellerId,
      sellerName: target.sellerName.slice(0, 300),
      sellerStoreUrl: target.sellerStoreUrl,
      keyword: target.keyword,
    }))
    .flatMap((parsed) => (parsed.success ? [parsed.data] : []))
    .filter((target, index, all) => all.findIndex((other) => other.sellerId === target.sellerId) === index)
    .slice(0, COMPETITOR_CATALOG_MAX_TARGETS);
  const chosen = input.scope.sellerId ? targets.filter((target) => target.sellerId === input.scope.sellerId) : targets;
  if (input.scope.sellerId && chosen.length !== 1) {
    throw new KiditemNotFoundError('ADVERTISING_COMPETITOR_SELLER_NOT_FOUND', { details: { reason: 'seller_not_tracked' } });
  }
  return {
    targets: chosen,
    productLimit: input.scope.rankEnrichment ? COMPETITOR_CATALOG_ENRICHMENT_MAX_PRODUCTS : COMPETITOR_CATALOG_MAX_PRODUCTS,
  };
}

/** 청크 → 카탈로그. 계획한 판매자마다 정확히 하나, 상점 주소·키워드가 계획과 같고 상품 수가 상한 안이어야 발행한다. */
export function assembleCompetitorCatalogs(plan: CompetitorCatalogPlan, chunks: readonly OperationStagedChunk[]): CompetitorCatalogItem[] {
  const planned = new Map(plan.targets.map((target) => [target.sellerId, target]));
  const seen = new Map<string, CompetitorCatalogItem>();
  for (const chunk of chunks) {
    if (chunk.chunkKind !== COMPETITOR_CATALOG_CHUNK_KIND) invalid('unexpected_chunk_kind');
    for (const raw of chunk.payload) {
      const parsed = CompetitorCatalogItemSchema.safeParse(raw);
      if (!parsed.success) invalid('invalid_chunk_item');
      const catalog = parsed.data;
      const target = planned.get(catalog.sellerId);
      if (!target || seen.has(catalog.sellerId)) invalid('catalog_target_not_planned');
      if (catalog.sellerStoreUrl !== target.sellerStoreUrl || advertisingKeywordIdentity(catalog.keyword) !== advertisingKeywordIdentity(target.keyword)) {
        invalid('catalog_target_mismatch');
      }
      if (catalog.products.length > plan.productLimit || catalog.products.some((product) => product.sourceRank > plan.productLimit)) {
        invalid('catalog_product_limit');
      }
      seen.set(catalog.sellerId, catalog);
    }
  }
  if (seen.size !== planned.size) {
    throw new KiditemConflictError('ADVERTISING_COLLECTION_INCOMPLETE', { details: { reason: 'catalog_snapshot_incomplete' } });
  }
  return [...seen.values()];
}

function invalid(reason: string): never {
  throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason } });
}
