import { SOURCING_CHUNK_KINDS, SOURCING_OPERATION_KINDS } from '@kiditem/shared/sourcing-operation';
import type { Collector } from '../collector';
import { registerCollector } from '../index';

/** 이 수집기가 쿠팡 검색에서 쓰는 것(`sites/coupang-search`가 구현). */
export interface CoupangKeywordSuggestionSite {
  keywordSuggestions(keyword: string, maxResults: number): Promise<{
    items: Array<{ rank: number; keyword: string; source: 'coupang-autocomplete' | 'coupang-search-dom' }>;
    productNameTokens: Array<{ keyword: string; count: number }>;
    warnings: string[];
  }>;
}

export interface CoupangKeywordSuggestionPlan {
  keyword: string;
  maxResults: number;
}

/**
 * `sourcing.coupang_keyword_suggestion`(KID-360): 키워드 하나의 쿠팡 검색창 추천 키워드와 검색 결과 상품명 토큰을
 * 문서 한 장(`keyword_suggestions`, 옛 attempt 완료 본문과 같은 모양)으로 낸다.
 */
export const sourcingCoupangKeywordSuggestionCollector: Collector<CoupangKeywordSuggestionPlan, Record<string, unknown>, CoupangKeywordSuggestionSite> = {
  kind: SOURCING_OPERATION_KINDS.coupangKeywordSuggestion,
  site: 'coupang-search',
  async *collect(plan, site, { signal }) {
    if (signal.aborted) return;
    const suggestions = await site.keywordSuggestions(plan.keyword, plan.maxResults);
    if (signal.aborted) return;
    yield {
      chunkKind: SOURCING_CHUNK_KINDS.keywordSuggestions,
      payload: [{
        keyword: plan.keyword,
        capturedAt: new Date().toISOString(),
        items: suggestions.items.slice(0, plan.maxResults),
        productNameTokens: suggestions.productNameTokens.slice(0, plan.maxResults),
        warnings: suggestions.warnings,
      }],
      progress: { current: 1, total: 1, label: plan.keyword },
    };
  },
};

registerCollector(sourcingCoupangKeywordSuggestionCollector);
