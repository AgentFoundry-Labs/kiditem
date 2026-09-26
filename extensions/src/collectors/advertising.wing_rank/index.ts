import {
  WING_RANK_CHUNK_KIND,
  WING_RANK_KIND,
  type WingRankChunkItem,
  type WingRankItem,
  type WingRankPlan,
} from '@kiditem/shared/advertising-operations';
import type { Collector } from '../collector';
import { registerCollector } from '../index';
import { readWingSearchKeyword, type WingSearchKeywordSite, type WingSearchMetricsRow } from '../wing-search-keyword';

/**
 * `advertising.wing_rank`(KID-362): 계획한 키워드마다 Wing 상품등록 검색을 최대 `maxPages`쪽 읽어, 28일 판매량
 * 내림차순으로 순위를 매긴 결과를 키워드마다 청크 한 장(`wing_rank_keyword`)으로 낸다. 어느 자사 상품이 몇 위인지·
 * 순위권 밖인지는 서버 finalize가 plan의 대상으로 정한다. 읽기만 한다.
 */
export const advertisingWingRankCollector: Collector<WingRankPlan, Record<string, unknown>, WingSearchKeywordSite<WingSearchMetricsRow>> = {
  kind: WING_RANK_KIND,
  site: 'wing-search',
  async *collect(plan, site, { signal }) {
    for (const [index, { keyword }] of plan.keywords.entries()) {
      const read = await readWingSearchKeyword(site, keyword, plan.maxPages, signal);
      if (read === null) return;
      const chunk: WingRankChunkItem = {
        keyword,
        capturedAt: new Date().toISOString(),
        pagesScanned: read.pagesScanned,
        items: rankBySales(read.rows),
      };
      yield {
        chunkKind: WING_RANK_CHUNK_KIND,
        payload: [chunk],
        progress: { current: index + 1, total: plan.keywords.length, label: keyword },
      };
    }
  },
};

/** 28일 판매량 → 추정 매출 → 상품 ID 순(옛 `sortWingCatalogRowsBySales`)으로 줄 세워 1부터 순위를 매긴다. */
export function rankBySales(rows: readonly WingSearchMetricsRow[]): WingRankItem[] {
  return [...rows]
    .sort((a, b) => (b.salesLast28d ?? 0) - (a.salesLast28d ?? 0)
      || (b.estimatedRevenue28d ?? 0) - (a.estimatedRevenue28d ?? 0)
      || a.productId.localeCompare(b.productId))
    .map((row, index) => ({
      productId: row.productId.slice(0, 40),
      itemId: row.itemId?.slice(0, 40) ?? null,
      vendorItemId: row.vendorItemId?.slice(0, 40) ?? null,
      productName: row.productName ? row.productName.slice(0, 500) : null,
      categoryHierarchy: row.categoryHierarchy?.slice(0, 1_000) ?? null,
      salesRank: index + 1,
      salePrice: finite(row.salePrice),
      ratingCount: finite(row.ratingCount),
      pvLast28Day: finite(row.pvLast28Day),
      salesLast28d: finite(row.salesLast28d),
      estimatedRevenue28d: finite(row.estimatedRevenue28d),
      conversionRate28d: finite(row.conversionRate28d),
    }));
}

function finite(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

registerCollector(advertisingWingRankCollector);
