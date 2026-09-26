import { describe, expect, it } from 'vitest';
import type { CollectedChunk } from '../collector';
import { ADVERTISING_COLLECTION_INCOMPLETE, type WingSearchKeywordSite, type WingSearchMetricsRow } from '../wing-search-keyword';
import { advertisingWingTrackedProductsCollector } from './index';

function row(productId: string, salePrice: number): WingSearchMetricsRow {
  return { productId, itemId: null, vendorItemId: null, productName: productId, categoryHierarchy: null, salePrice, rating: 4.5, ratingCount: 3,
    pvLast28Day: 100, salesLast28d: 5, estimatedRevenue28d: salePrice * 5, conversionRate28d: 0.05 };
}

function site(pages: Record<string, Array<{ rows: WingSearchMetricsRow[]; nextSearchPage: number | null }>>): WingSearchKeywordSite<WingSearchMetricsRow> & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async searchPage(keyword, searchPage) {
      asked.push(`${keyword}#${searchPage}`);
      return pages[keyword]?.[searchPage] ?? { rows: [], nextSearchPage: null };
    },
  };
}

const plan = (keywords: string[]) => ({
  channelAccountId: '11111111-1111-4111-8111-111111111111',
  businessDate: '2026-09-26',
  keywords,
  maxPages: 3,
  products: [{ productId: 'p-1', sourceKeyword: '연필' }, { productId: 'p-2', sourceKeyword: null }],
});

async function collect(keywords: string[], wing: WingSearchKeywordSite<WingSearchMetricsRow>) {
  const chunks: CollectedChunk[] = [];
  for await (const chunk of advertisingWingTrackedProductsCollector.collect(plan(keywords), wing, { signal: new AbortController().signal, tabId: null })) chunks.push(chunk);
  return chunks;
}

describe('advertising.wing_tracked_products collector (KID-362)', () => {
  it('reads each keyword to the end and keeps only planned tracked products, one chunk per keyword even when empty', async () => {
    const wing = site({
      연필: [{ rows: [row('p-1', 1_000), row('x', 5)], nextSearchPage: 1 }, { rows: [row('p-2', 2_000)], nextSearchPage: null }],
    });
    const chunks = await collect(['연필', '지우개'], wing);
    expect(wing.asked).toEqual(['연필#0', '연필#1', '지우개#0']);
    expect(chunks.map((chunk) => chunk.payload[0])).toEqual([
      { keyword: '연필', items: [
        { productId: 'p-1', salePriceKrw: 1_000, ratingCount: 3, ratingAverage: 4.5, pvLast28Day: 100, salesLast28d: 5, estimatedRevenue28d: 5_000, conversionRate28d: 0.05 },
        { productId: 'p-2', salePriceKrw: 2_000, ratingCount: 3, ratingAverage: 4.5, pvLast28Day: 100, salesLast28d: 5, estimatedRevenue28d: 10_000, conversionRate28d: 0.05 },
      ] },
      { keyword: '지우개', items: [] },
    ]);
    expect(chunks[1]?.progress).toEqual({ current: 2, total: 2, label: '지우개' });
  });

  it('fails as incomplete when Wing does not advance the page before the page limit', async () => {
    await expect(collect(['연필'], site({ 연필: [{ rows: [row('p-1', 1)], nextSearchPage: 0 }] })))
      .rejects.toMatchObject({ code: ADVERTISING_COLLECTION_INCOMPLETE });
  });
});
