import { describe, expect, it } from 'vitest';
import type { CollectedChunk } from '../collector';
import type { WingSearchKeywordSite, WingSearchMetricsRow } from '../wing-search-keyword';
import { advertisingWingRankCollector } from './index';

function row(productId: string, vendorItemId: string, salesLast28d: number | null, estimatedRevenue28d: number | null = null): WingSearchMetricsRow {
  return { productId, itemId: null, vendorItemId, productName: `${productId} 상품`, categoryHierarchy: '완구', salePrice: 1_000, rating: 4.5,
    ratingCount: 3, pvLast28Day: 100, salesLast28d, estimatedRevenue28d, conversionRate28d: 0.1 };
}

const plan = {
  channelAccountId: '11111111-1111-4111-8111-111111111111',
  maxPages: 5,
  keywords: [
    { keyword: '슬라임', targets: [{ vendorItemId: 'V1', productName: 'x', category: null, candidateIndex: 0 }] },
    { keyword: '연필', targets: [{ vendorItemId: 'V9', productName: 'y', category: null, candidateIndex: 0 }] },
  ],
  selection: { productCount: 2, keywordCount: 2, resumed: false, pendingProductCount: 2 },
};

describe('advertising.wing_rank collector (KID-362)', () => {
  it('ranks each keyword by 28-day sales, then revenue, then product id, one chunk per planned keyword', async () => {
    const asked: string[] = [];
    const site: WingSearchKeywordSite<WingSearchMetricsRow> = {
      async searchPage(keyword, searchPage) {
        asked.push(`${keyword}#${searchPage}`);
        if (keyword === '슬라임' && searchPage === 0) {
          return { rows: [row('B', 'V2', 5, 10), row('A', 'V1', 9), row('C', 'V3', 5, 20)], nextSearchPage: 1 };
        }
        return { rows: [], nextSearchPage: null };
      },
    };
    const chunks: CollectedChunk[] = [];
    for await (const chunk of advertisingWingRankCollector.collect(plan, site, { signal: new AbortController().signal, tabId: null })) chunks.push(chunk);

    expect(asked).toEqual(['슬라임#0', '슬라임#1', '연필#0']);
    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual(['wing_rank_keyword', 'wing_rank_keyword']);
    const first = chunks[0]!.payload[0] as { keyword: string; pagesScanned: number; items: Array<{ vendorItemId: string; salesRank: number }> };
    expect(first).toMatchObject({ keyword: '슬라임', pagesScanned: 2 });
    expect(first.items.map((item) => [item.vendorItemId, item.salesRank])).toEqual([['V1', 1], ['V3', 2], ['V2', 3]]);
    expect(chunks[1]!.payload[0]).toMatchObject({ keyword: '연필', pagesScanned: 1, items: [] });
  });
});
