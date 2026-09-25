import { describe, expect, it } from 'vitest';
import type { CollectedChunk } from '../collector';
import { SOURCING_COLLECTION_INCOMPLETE, sourcingWingCatalogCollector, type WingCatalogSearchSite } from './index';

type Row = { id: string };
function site(pages: Record<string, Array<{ rows: Row[]; nextSearchPage: number | null }>>): WingCatalogSearchSite<Row> & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async searchPage(keyword, searchPage) {
      asked.push(`${keyword}#${searchPage}`);
      return pages[keyword]?.[searchPage] ?? { rows: [], nextSearchPage: null };
    },
    identity: (row) => row.id,
    toObservation: (row, keyword, capturedAt) => ({
      productId: row.id, itemId: null, vendorItemId: null, productName: row.id, itemName: null, brandName: null,
      manufacture: null, categoryHierarchy: null, imagePath: null, salePriceKrw: null, ratingAverage: null, ratingCount: null,
      viewsLast28d: null, salesLast28d: null, estimatedRevenue28d: null, conversionRate28d: null, deliveryInfo: null,
      sourceKeyword: keyword, capturedAt,
    }),
  };
}

async function collect(plan: { keywords: string[]; maxPages: number; purpose: string }, wing: WingCatalogSearchSite<Row>) {
  const chunks: CollectedChunk[] = [];
  for await (const chunk of sourcingWingCatalogCollector.collect(plan, wing as WingCatalogSearchSite, { signal: new AbortController().signal, tabId: null })) chunks.push(chunk);
  return chunks;
}

describe('sourcing.wing_catalog collector (KID-360)', () => {
  it('reads up to maxPages per keyword, dedupes rows, and yields one chunk per keyword including an empty one', async () => {
    const wing = site({
      필통: [{ rows: [{ id: 'a' }, { id: 'b' }], nextSearchPage: 1 }, { rows: [{ id: 'b' }, { id: 'c' }], nextSearchPage: 2 }],
      지우개: [],
    });
    const chunks = await collect({ keywords: ['필통', '지우개'], maxPages: 2, purpose: 'catalog_search' }, wing);
    expect(wing.asked).toEqual(['필통#0', '필통#1', '지우개#0']);
    expect(chunks.map((chunk) => chunk.chunkKind)).toEqual(['wing_search_page', 'wing_search_page']);
    const [first, second] = chunks.map((chunk) => chunk.payload[0] as { keyword: string; maxPages: number; purpose: string; items: Array<{ productId: string }> });
    expect(first).toMatchObject({ keyword: '필통', maxPages: 2, purpose: 'catalog_search' });
    expect(first.items.map((item) => item.productId)).toEqual(['a', 'b', 'c']);
    expect(second).toMatchObject({ keyword: '지우개', items: [] });
  });

  it('fails as incomplete when Wing does not advance the page before maxPages', async () => {
    const wing = site({ 필통: [{ rows: [{ id: 'a' }], nextSearchPage: 0 }] });
    await expect(collect({ keywords: ['필통'], maxPages: 3, purpose: 'catalog_search' }, wing))
      .rejects.toMatchObject({ code: SOURCING_COLLECTION_INCOMPLETE });
  });

  it('caps a keyword at 100 items (the server chunk element limit)', async () => {
    const rows = Array.from({ length: 120 }, (_, index) => ({ id: String(index) }));
    const chunks = await collect({ keywords: ['필통'], maxPages: 1, purpose: 'catalog_search' }, site({ 필통: [{ rows, nextSearchPage: 1 }] }));
    expect((chunks[0].payload[0] as { items: unknown[] }).items).toHaveLength(100);
  });
});
