import {
  WING_TRACKED_PRODUCTS_CHUNK_KIND,
  WING_TRACKED_PRODUCTS_KIND,
  type WingTrackedProductItem,
  type WingTrackedProductsPlan,
  type WingTrackedSearchChunkItem,
} from '@kiditem/shared/advertising-operations';
import type { Collector } from '../collector';
import { registerCollector } from '../index';
import {
  boundedInteger,
  boundedNumber,
  readWingSearchKeyword,
  type WingSearchKeywordSite,
  type WingSearchMetricsRow,
} from '../wing-search-keyword';

/**
 * `advertising.wing_tracked_products`(KID-362): 계획한 키워드마다 Wing 상품등록 검색을 최대 `maxPages`쪽 읽어, 계획한
 * 추적 상품만 28일 지표로 바꿔 키워드마다 청크 한 장(`wing_tracked_search`)을 낸다(못 찾아도 한 장). 어느 상품을
 * 어느 키워드로 받을지·다 찾았는지는 서버 finalize가 정한다. 읽기만 한다.
 */
export const advertisingWingTrackedProductsCollector: Collector<WingTrackedProductsPlan, Record<string, unknown>, WingSearchKeywordSite<WingSearchMetricsRow>> = {
  kind: WING_TRACKED_PRODUCTS_KIND,
  site: 'wing-search',
  async *collect(plan, site, { signal }) {
    const planned = new Set(plan.products.map((product) => product.productId));
    for (const [index, keyword] of plan.keywords.entries()) {
      const rows = await readWingSearchKeyword(site, keyword, plan.maxPages, signal);
      if (rows === null) return;
      const items = new Map<string, WingTrackedProductItem>();
      for (const row of rows) {
        if (planned.has(row.productId) && !items.has(row.productId)) items.set(row.productId, trackedItem(row));
      }
      const chunk: WingTrackedSearchChunkItem = { keyword, items: [...items.values()] };
      yield {
        chunkKind: WING_TRACKED_PRODUCTS_CHUNK_KIND,
        payload: [chunk],
        progress: { current: index + 1, total: plan.keywords.length, label: keyword },
      };
    }
  },
};

export function trackedItem(row: WingSearchMetricsRow): WingTrackedProductItem {
  return {
    productId: row.productId,
    salePriceKrw: boundedInteger(row.salePrice),
    ratingCount: boundedInteger(row.ratingCount),
    ratingAverage: boundedNumber(row.rating, 0, 5),
    pvLast28Day: boundedInteger(row.pvLast28Day),
    salesLast28d: boundedInteger(row.salesLast28d),
    estimatedRevenue28d: boundedNumber(row.estimatedRevenue28d, 0, 2_147_483_647),
    conversionRate28d: boundedNumber(row.conversionRate28d, 0, 1),
  };
}

registerCollector(advertisingWingTrackedProductsCollector);
