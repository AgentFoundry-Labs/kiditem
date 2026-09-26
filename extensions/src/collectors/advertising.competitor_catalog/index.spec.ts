import { describe, expect, it } from 'vitest';
import type { CollectedChunk } from '../collector';
import { advertisingCompetitorCatalogCollector, type CoupangShopCatalogSite } from './index';

const target = (sellerId: string) => ({ sellerId, sellerName: `판매자 ${sellerId}`, sellerStoreUrl: `https://shop.coupang.com/vid/${sellerId}`, keyword: '슬라임' });

describe('advertising.competitor_catalog collector (KID-362)', () => {
  it('reads each planned seller shop with the plan product limit, one chunk per seller, and closes the tab', async () => {
    const calls: string[] = [];
    const site: CoupangShopCatalogSite = {
      async catalog(value, limit) {
        calls.push(`${value.sellerId}:${limit}`);
        return { keyword: value.keyword, sellerId: value.sellerId, sellerName: value.sellerName, sellerStoreUrl: value.sellerStoreUrl, totalProductCount: null,
          collectedProductCount: 1, isTruncated: false, sort: 'newest', capturedAt: '2026-09-26T00:00:00.000Z',
          products: [{ sourceRank: 1, productId: '1', itemId: null, vendorItemId: null, name: 'x', priceKrw: null, reviewCount: null, imageUrl: null, link: null }] };
      },
      async close() { calls.push('close'); },
    };
    const chunks: CollectedChunk[] = [];
    for await (const chunk of advertisingCompetitorCatalogCollector.collect({ targets: [target('A'), target('B')], productLimit: 500 }, site, { signal: new AbortController().signal, tabId: null })) chunks.push(chunk);
    expect(calls).toEqual(['A:500', 'B:500', 'close']);
    expect(chunks.map((chunk) => [chunk.chunkKind, (chunk.payload[0] as { sellerId: string }).sellerId, chunk.progress])).toEqual([
      ['seller_catalog', 'A', { current: 1, total: 2, label: '판매자 A' }],
      ['seller_catalog', 'B', { current: 2, total: 2, label: '판매자 B' }],
    ]);
  });
});
