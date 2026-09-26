import { describe, expect, it } from 'vitest';
import type { CollectedChunk } from '../collector';
import { advertisingCompetitorSellerIdentityCollector, type CoupangProductSellerSite } from './index';

const target = (keyword: string, productId: string) => ({
  keyword, productKey: `vendor-item:v-${productId}`, productId, vendorItemId: `v-${productId}`, name: `상품 ${productId}`,
  link: `https://www.coupang.com/vp/products/${productId}?vendorItemId=v-${productId}`, rank: 1, matchScore: 1,
});

describe('advertising.competitor_seller_identity collector (KID-362)', () => {
  it('opens each product once even when it appears under several keywords, skips unreadable sellers, and closes the tab', async () => {
    const opened: string[] = [];
    const site: CoupangProductSellerSite = {
      async sellerIdentity(link) {
        opened.push(link);
        return link.includes('/2?') ? null : { sellerName: '판매자', sellerId: 'S1', sellerStoreUrl: 'https://shop.coupang.com/vid/S1' };
      },
      async close() { opened.push('close'); },
    };
    const plan = { targets: [target('슬라임', '1'), target('액체괴물', '1'), target('슬라임', '2')], excludedTargetCount: 0 };
    const chunks: CollectedChunk[] = [];
    for await (const chunk of advertisingCompetitorSellerIdentityCollector.collect(plan, site, { signal: new AbortController().signal, tabId: null })) chunks.push(chunk);

    expect(opened).toEqual([plan.targets[0]!.link, plan.targets[2]!.link, 'close']);
    expect(chunks.map((chunk) => (chunk.payload as Array<{ keyword: string; sellerId: string }>).map((item) => [item.keyword, item.sellerId]))).toEqual([
      [['슬라임', 'S1'], ['액체괴물', 'S1']],
      [],
    ]);
    expect(chunks.map((chunk) => chunk.progress)).toEqual([
      { current: 1, total: 2, label: '상품 1' },
      { current: 2, total: 2, label: '상품 2' },
    ]);
  });
});
