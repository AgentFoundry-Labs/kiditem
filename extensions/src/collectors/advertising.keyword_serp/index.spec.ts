import { describe, expect, it } from 'vitest';
import type { CollectedChunk } from '../collector';
import { advertisingKeywordSerpCollector, type KeywordSerpSite } from './index';

const plan = {
  keywords: [{ keyword: '슬라임', maxPages: 3, explicitVendorItemIds: [] }, { keyword: '연필', maxPages: 2, explicitVendorItemIds: ['V1'] }],
  ownItems: [],
};

describe('advertising.keyword_serp collector (KID-362)', () => {
  it('reads each planned keyword with its page limit, yields one chunk per keyword, reports operator attention and closes the tab', async () => {
    const calls: string[] = [];
    const progress: unknown[] = [];
    const site: KeywordSerpSite = {
      async serp(keyword, maxPages, options) {
        calls.push(`${keyword}:${maxPages}`);
        if (keyword === '연필') await options?.onAttention?.({ kind: 'verification', site: '쿠팡', label: keyword });
        return { pagesScanned: 1, stopReason: 'empty_page', items: [{ rank: 1, page: 1, positionInPage: 1, isAd: false, productId: 'p', itemId: null,
          vendorItemId: 'V1', name: null, priceKrw: null, reviewCount: null, ratingScore: null, imageUrl: null, link: null }] };
      },
      async closeSerp() { calls.push('close'); },
    };
    const chunks: CollectedChunk[] = [];
    for await (const chunk of advertisingKeywordSerpCollector.collect(plan, site, {
      signal: new AbortController().signal, tabId: null, report: async (value) => { progress.push(value); },
    })) chunks.push(chunk);

    expect(calls).toEqual(['슬라임:3', '연필:2', 'close']);
    expect(chunks.map((chunk) => [chunk.chunkKind, (chunk.payload[0] as { keyword: string }).keyword])).toEqual([['keyword_serp', '슬라임'], ['keyword_serp', '연필']]);
    expect(progress).toEqual([{ current: 1, total: 2, label: '연필', attention: expect.objectContaining({ kind: 'verification', site: '쿠팡', label: '연필' }) }]);
  });
});
