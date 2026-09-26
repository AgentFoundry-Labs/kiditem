import { KiditemConflictError, KiditemInvalidValueError, KiditemPreconditionError } from '@kiditem/shared/errors';
import {
  WING_RANK_CHUNK_KIND,
  WING_RANK_MAX_KEYWORDS,
  WING_RANK_MAX_PAGES,
  WingRankChunkItemSchema,
  advertisingKeywordIdentity,
  type WingRankChunkItem,
  type WingRankPlan,
} from '@kiditem/shared/advertising-operations';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import type { RepresentativeKeywordSearchAssignment } from './representative-keyword';

export interface WingRankSelectionInput {
  productCount: number;
  resumed: boolean;
  pendingProductCount: number;
  keywordCount: number;
  targets: ReadonlyArray<{ keyword: string }>;
}

/**
 * Wing 판매순위 계획(`advertising.wing_rank`, KID-362): 서버가 고른 키워드 순서(오늘 아직 안 본 대표 키워드 먼저)를 그대로
 * 쓰고, 키워드를 주면 오늘 수집 여부와 상관없이 그 키워드만 돈다. 키워드마다 그 키워드를 대표(후보)로 둔 자사 상품이 대상이다.
 */
export function planWingRank(input: {
  channelAccountId: string;
  selection: WingRankSelectionInput;
  assignments: readonly RepresentativeKeywordSearchAssignment[];
  keywords?: readonly string[];
}): WingRankPlan {
  const requested = input.keywords ? new Set(input.keywords.map(advertisingKeywordIdentity)) : null;
  // 키워드를 주면 오늘 수집 여부와 상관없이 그 키워드만(대표 키워드로 둔 상품이 있는 것), 안 주면 서버 선택 순서.
  const ordered = requested
    ? [...new Set(input.assignments.map((assignment) => assignment.keyword))]
      .filter((keyword) => requested.has(advertisingKeywordIdentity(keyword)))
    : input.selection.targets.map((target) => target.keyword);
  const keywords = ordered
    .map((keyword) => ({
      keyword,
      targets: input.assignments
        .filter((assignment) => assignment.keyword === keyword)
        .map(({ vendorItemId, productName, category, candidateIndex }) => ({
          vendorItemId,
          productName: productName.slice(0, 500),
          category: category?.slice(0, 1_000) ?? null,
          candidateIndex,
        })),
    }))
    .filter((entry) => entry.targets.length > 0);
  if (keywords.length === 0) {
    throw new KiditemPreconditionError('ADVERTISING_RANK_TARGETS_EMPTY', { details: { reason: requested ? 'keywords_not_representative' : 'no_own_products' } });
  }
  if (keywords.length > WING_RANK_MAX_KEYWORDS) {
    throw new KiditemPreconditionError('ADVERTISING_RANK_TARGETS_EMPTY', { details: { reason: 'too_many_keywords' } });
  }
  return {
    channelAccountId: input.channelAccountId,
    maxPages: WING_RANK_MAX_PAGES,
    keywords,
    selection: {
      productCount: input.selection.productCount,
      keywordCount: input.selection.keywordCount,
      resumed: input.selection.resumed,
      pendingProductCount: input.selection.pendingProductCount,
    },
  };
}

/** 계획한 키워드마다 정확히 한 장의 청크. 빠지거나 겹치거나 계획 밖 키워드면 발행하지 않는다. */
export function assembleWingRankCaptures(plan: WingRankPlan, chunks: readonly OperationStagedChunk[]): Map<string, WingRankChunkItem> {
  const byKeyword = new Map<string, WingRankChunkItem>();
  for (const chunk of chunks) {
    if (chunk.chunkKind !== WING_RANK_CHUNK_KIND) invalid('unexpected_chunk_kind');
    for (const raw of chunk.payload) {
      const parsed = WingRankChunkItemSchema.safeParse(raw);
      if (!parsed.success) invalid('invalid_chunk_item');
      const identity = advertisingKeywordIdentity(parsed.data.keyword);
      if (byKeyword.has(identity)) invalid('duplicate_keyword');
      byKeyword.set(identity, parsed.data);
    }
  }
  const planned = new Set(plan.keywords.map((entry) => advertisingKeywordIdentity(entry.keyword)));
  if ([...byKeyword.keys()].some((identity) => !planned.has(identity))) invalid('keyword_not_planned');
  const missing = plan.keywords.filter((entry) => !byKeyword.has(advertisingKeywordIdentity(entry.keyword))).map((entry) => entry.keyword);
  if (missing.length > 0) throw new KiditemConflictError('ADVERTISING_COLLECTION_INCOMPLETE', { details: { reason: 'keywords_missing' } });
  return byKeyword;
}

function invalid(reason: string): never {
  throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason } });
}
