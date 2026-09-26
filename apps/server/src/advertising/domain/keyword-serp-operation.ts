import { KiditemConflictError, KiditemInvalidValueError } from '@kiditem/shared/errors';
import {
  KEYWORD_SERP_CHUNK_KIND,
  KEYWORD_SERP_MAX_PAGES,
  KeywordSerpChunkItemSchema,
  advertisingKeywordIdentity,
  type KeywordSerpChunkItem,
  type KeywordSerpPlan,
} from '@kiditem/shared/advertising-operations';
import type { OperationStagedChunk } from '@kiditem/shared/operation';

/** 트래커가 없는 키워드의 쪽 수(옛 수집기 기본 MAX_PAGES). */
const DEFAULT_SERP_PAGES = KEYWORD_SERP_MAX_PAGES;

/**
 * SERP 순위 계획(`advertising.keyword_serp`, KID-362): 키워드마다 트래커의 쪽 수(없으면 3, 3을 넘지 않는다)와 명시 추적 옵션,
 * 그리고 자사 옵션 목록(노출됐을 때 순위 행을 만든다)을 고정한다.
 */
export function planKeywordSerp(input: {
  keywords: readonly string[];
  trackers: ReadonlyArray<{ keyword: string; maxPages: number; vendorItemIds: readonly string[]; enabled: boolean }>;
  ownItems: ReadonlyArray<{ vendorItemId: string; productName: string }>;
}): KeywordSerpPlan {
  const trackerByKeyword = new Map(input.trackers.map((tracker) => [advertisingKeywordIdentity(tracker.keyword), tracker]));
  return {
    keywords: input.keywords.map((keyword) => {
      const tracker = trackerByKeyword.get(advertisingKeywordIdentity(keyword));
      return {
        keyword,
        maxPages: Math.max(1, Math.min(KEYWORD_SERP_MAX_PAGES, Math.floor(tracker?.maxPages ?? DEFAULT_SERP_PAGES))),
        explicitVendorItemIds: [...new Set(tracker?.vendorItemIds ?? [])].slice(0, 500),
      };
    }),
    ownItems: [...new Map(input.ownItems.map((item) => [item.vendorItemId, { vendorItemId: item.vendorItemId, productName: item.productName.slice(0, 500) }])).values()],
  };
}

/** 계획한 키워드마다 정확히 한 장의 청크. 빠지거나 겹치거나 계획 밖 키워드면 발행하지 않는다. */
export function assembleKeywordSerpCaptures(plan: KeywordSerpPlan, chunks: readonly OperationStagedChunk[]): Map<string, KeywordSerpChunkItem> {
  const byKeyword = new Map<string, KeywordSerpChunkItem>();
  for (const chunk of chunks) {
    if (chunk.chunkKind !== KEYWORD_SERP_CHUNK_KIND) invalid('unexpected_chunk_kind');
    for (const raw of chunk.payload) {
      const parsed = KeywordSerpChunkItemSchema.safeParse(raw);
      if (!parsed.success) invalid('invalid_chunk_item');
      const identity = advertisingKeywordIdentity(parsed.data.keyword);
      if (byKeyword.has(identity)) invalid('duplicate_keyword');
      byKeyword.set(identity, parsed.data);
    }
  }
  const planned = new Set(plan.keywords.map((entry) => advertisingKeywordIdentity(entry.keyword)));
  if ([...byKeyword.keys()].some((identity) => !planned.has(identity))) invalid('keyword_not_planned');
  if (plan.keywords.some((entry) => !byKeyword.has(advertisingKeywordIdentity(entry.keyword)))) {
    throw new KiditemConflictError('ADVERTISING_COLLECTION_INCOMPLETE', { details: { reason: 'keywords_missing' } });
  }
  return byKeyword;
}

function invalid(reason: string): never {
  throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason } });
}
