import type { SourcingWingCatalogObservation } from '@kiditem/shared/sourcing';
import { SOURCING_CHUNK_KINDS, SOURCING_OPERATION_KINDS } from '@kiditem/shared/sourcing-operation';
import { RuntimeError } from '../../core/errors';
import type { Collector } from '../collector';
import { registerCollector } from '../index';

/** Wing 검색 결과 한 페이지(사이트가 행을 관측으로 바꿀 수 있게 정규화한 모양). */
export interface WingSearchPageResult<TRow> {
  rows: TRow[];
  nextSearchPage: number | null;
}

/** 이 수집기가 Wing에서 쓰는 것(`sites/wing/pre-matching-search`가 구현). */
export interface WingCatalogSearchSite<TRow = unknown> {
  searchPage(keyword: string, searchPage: number): Promise<WingSearchPageResult<TRow>>;
  identity(row: TRow): string;
  toObservation(row: TRow, keyword: string, capturedAt: string): SourcingWingCatalogObservation | null;
}

export interface WingCatalogPlan {
  keywords: string[];
  maxPages: number;
  purpose: string;
}

/** 키워드 하나의 상품 상한(서버 청크 원소 상한과 같다). */
const MAX_ITEMS_PER_KEYWORD = 100;
export const SOURCING_COLLECTION_INCOMPLETE = 'SOURCING_COLLECTION_INCOMPLETE' as const;

/**
 * `sourcing.wing_catalog`(KID-360): 계획한 키워드마다 Wing 상품등록 검색을 최대 `maxPages`쪽 읽어 키워드당 청크
 * 한 장(`wing_search_page`, 원소 = 옛 attempt 청크 {keyword, maxPages, purpose, items})을 낸다. 결과가 없는 키워드도
 * 한 장 낸다(서버가 키워드마다 발행 receipt를 만든다). 쪽이 멈추면(다음 쪽 번호가 그대로) 부분 결과로 실패한다.
 */
export const sourcingWingCatalogCollector: Collector<WingCatalogPlan, Record<string, unknown>, WingCatalogSearchSite> = {
  kind: SOURCING_OPERATION_KINDS.wingCatalog,
  site: 'wing-search',
  async *collect(plan, site, { signal }) {
    for (const [index, keyword] of plan.keywords.entries()) {
      if (signal.aborted) return;
      const rows = new Map<string, unknown>();
      let searchPage = 0;
      for (let pageIndex = 0; pageIndex < plan.maxPages; pageIndex += 1) {
        if (signal.aborted) return;
        const page = await site.searchPage(keyword, searchPage);
        for (const row of page.rows) {
          const key = site.identity(row);
          if (!rows.has(key)) rows.set(key, row);
        }
        if (page.rows.length === 0 || page.nextSearchPage === null) break;
        if (page.nextSearchPage === searchPage) {
          if (pageIndex + 1 < plan.maxPages) {
            throw new RuntimeError(SOURCING_COLLECTION_INCOMPLETE, `Wing 검색 '${keyword}'의 다음 쪽이 넘어가지 않았습니다. 다시 수집해 주세요.`, { keyword });
          }
          break;
        }
        searchPage = page.nextSearchPage;
      }
      const capturedAt = new Date().toISOString();
      const items = [...rows.values()]
        .map((row) => site.toObservation(row, keyword, capturedAt))
        .filter((item): item is SourcingWingCatalogObservation => item !== null)
        .slice(0, MAX_ITEMS_PER_KEYWORD);
      yield {
        chunkKind: SOURCING_CHUNK_KINDS.wingSearchPage,
        payload: [{ keyword, maxPages: plan.maxPages, purpose: plan.purpose, items }],
        progress: { current: index + 1, total: plan.keywords.length, label: keyword },
      };
    }
  },
};

registerCollector(sourcingWingCatalogCollector);
