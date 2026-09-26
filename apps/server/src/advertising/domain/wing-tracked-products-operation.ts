import {
  KiditemConflictError,
  KiditemInvalidValueError,
  KiditemPreconditionError,
} from '@kiditem/shared/errors';
import {
  WING_TRACKED_PRODUCTS_CHUNK_KIND,
  WING_TRACKED_PRODUCTS_MAX_PAGES,
  WING_TRACKED_PRODUCTS_MAX_PRODUCTS,
  WingTrackedSearchChunkItemSchema,
  advertisingKeywordIdentity,
  type WingTrackedProductItem,
  type WingTrackedProductsPlan,
} from '@kiditem/shared/advertising-operations';
import type { OperationStagedChunk } from '@kiditem/shared/operation';

export interface WingTrackedTarget {
  productId: string;
  sourceKeyword: string | null;
}

/**
 * 추적 상품 수집 계획(`advertising.wing_tracked_products`, KID-362): 업무일·키워드·지금 켜진 추적 대상을 고정한다.
 * 추적 대상이 300개를 넘거나, 수집 키워드를 가진 추적 상품의 키워드가 요청에 없으면 시작하지 않는다(옛 attempt와 같다).
 */
export function planWingTrackedProducts(input: {
  channelAccountId: string;
  businessDate: string;
  keywords: readonly string[];
  targets: readonly WingTrackedTarget[];
}): WingTrackedProductsPlan {
  if (input.targets.length > WING_TRACKED_PRODUCTS_MAX_PRODUCTS) {
    throw new KiditemPreconditionError('ADVERTISING_TRACKED_PRODUCT_LIMIT', { details: { count: input.targets.length } });
  }
  const requested = new Set(input.keywords.map(advertisingKeywordIdentity));
  const missing = input.targets.filter((target) => target.sourceKeyword !== null && !requested.has(advertisingKeywordIdentity(target.sourceKeyword)));
  if (missing.length > 0) {
    throw new KiditemInvalidValueError('ADVERTISING_TRACKED_KEYWORDS_INCOMPLETE', {
      details: { keywords: [...new Set(missing.map((target) => target.sourceKeyword))] },
    });
  }
  return {
    channelAccountId: input.channelAccountId,
    businessDate: input.businessDate,
    keywords: [...input.keywords],
    maxPages: WING_TRACKED_PRODUCTS_MAX_PAGES,
    products: input.targets.map((target) => ({ productId: target.productId, sourceKeyword: target.sourceKeyword })),
  };
}

/** 수집한 추적 상품 하나와 그 지표를 받은 키워드. */
export interface WingTrackedCapture extends WingTrackedProductItem {
  sourceKeyword: string;
}

/**
 * 키워드 청크들 → 추적 상품마다 지표 하나. 계획한 키워드마다 청크가 정확히 한 장이어야 한다(아니면 수집 미완).
 * 수집 키워드가 있는 상품은 그 키워드 결과에서만, 없는 상품은 계획 순서로 처음 찾은 키워드에서 받는다.
 * 계획한 상품을 하나라도 찾지 못하면 발행하지 않는다.
 */
export function assembleWingTrackedCaptures(plan: WingTrackedProductsPlan, chunks: readonly OperationStagedChunk[]): WingTrackedCapture[] {
  const byKeyword = new Map<string, Map<string, WingTrackedProductItem>>();
  for (const chunk of chunks) {
    if (chunk.chunkKind !== WING_TRACKED_PRODUCTS_CHUNK_KIND) invalid('unexpected_chunk_kind');
    for (const raw of chunk.payload) {
      const parsed = WingTrackedSearchChunkItemSchema.safeParse(raw);
      if (!parsed.success) invalid('invalid_chunk_item');
      const identity = advertisingKeywordIdentity(parsed.data.keyword);
      if (byKeyword.has(identity)) invalid('duplicate_keyword');
      byKeyword.set(identity, new Map(parsed.data.items.map((item) => [item.productId, item])));
    }
  }
  const planned = plan.keywords.map(advertisingKeywordIdentity);
  const missingKeywords = plan.keywords.filter((_, index) => !byKeyword.has(planned[index]!));
  if (missingKeywords.length > 0 || byKeyword.size !== planned.length) {
    throw new KiditemConflictError('ADVERTISING_COLLECTION_INCOMPLETE', { details: { keywords: missingKeywords } });
  }
  const captures: WingTrackedCapture[] = [];
  const notFound: string[] = [];
  for (const product of plan.products) {
    const candidates = product.sourceKeyword === null
      ? plan.keywords
      : plan.keywords.filter((keyword) => advertisingKeywordIdentity(keyword) === advertisingKeywordIdentity(product.sourceKeyword!));
    const found = candidates
      .map((keyword) => ({ keyword, item: byKeyword.get(advertisingKeywordIdentity(keyword))?.get(product.productId) }))
      .find((candidate) => candidate.item !== undefined);
    if (!found?.item) {
      notFound.push(product.productId);
      continue;
    }
    captures.push({ ...found.item, sourceKeyword: found.keyword });
  }
  if (notFound.length > 0) {
    throw new KiditemConflictError('ADVERTISING_TRACKED_PRODUCT_NOT_FOUND', { details: { productIds: notFound } });
  }
  return captures;
}

/** 지금 켜진 추적 대상이 계획 때와 같은가(상품·수집 키워드, productId 순). */
export function sameTrackedTargets(planned: readonly WingTrackedTarget[], current: readonly WingTrackedTarget[]): boolean {
  return planned.length === current.length
    && planned.every((target, index) => target.productId === current[index]?.productId && target.sourceKeyword === current[index]?.sourceKeyword);
}

function invalid(reason: string): never {
  throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason } });
}
