import { describe, expect, it } from 'vitest';
import type { KeywordSerpChunkItem, KeywordSerpItem } from '@kiditem/shared/advertising-operations';
import { assembleKeywordSerpCaptures, completeSerpCapture } from '../keyword-serp-operation';

const item = (rank: number, page: number, positionInPage: number): KeywordSerpItem => ({
  rank, page, positionInPage, isAd: false, productId: `p${rank}`, itemId: null, vendorItemId: null, name: null,
  priceKrw: null, reviewCount: null, ratingScore: null, imageUrl: null, link: null,
});
const capture = (patch: Partial<KeywordSerpChunkItem>): KeywordSerpChunkItem => ({
  keyword: '슬라임', capturedAt: '2026-09-26T00:00:00.000Z', pagesScanned: 2, stopReason: 'page_limit',
  items: [item(1, 1, 1), item(2, 1, 2), item(3, 2, 1)], ...patch,
});

describe('SERP completeness (KID-362, the old validCapture rule)', () => {
  it('accepts every planned page read, or an observed empty page before the limit', () => {
    expect(completeSerpCapture(capture({}), 2)).toBe(true);
    expect(completeSerpCapture(capture({ stopReason: 'empty_page' }), 3)).toBe(true);
  });

  it('rejects walls, unknown results, short page_limit, empty_page at the limit and broken rank continuity', () => {
    expect(completeSerpCapture(capture({ stopReason: 'provider_wall' }), 3)).toBe(false);
    expect(completeSerpCapture(capture({ stopReason: 'invalid_result' }), 3)).toBe(false);
    expect(completeSerpCapture(capture({}), 3)).toBe(false);
    expect(completeSerpCapture(capture({ stopReason: 'empty_page' }), 2)).toBe(false);
    expect(completeSerpCapture(capture({ items: [item(1, 1, 1), item(3, 2, 1)] }), 2)).toBe(false);
    expect(completeSerpCapture(capture({ items: [item(1, 1, 1), item(2, 1, 2)] }), 2)).toBe(false);
    expect(completeSerpCapture(capture({ items: [item(1, 1, 1), item(2, 1, 1), item(3, 2, 1)] }), 2)).toBe(false);
  });

  it('refuses the whole run when one keyword capture is incomplete', () => {
    const plan = { keywords: [{ keyword: '슬라임', maxPages: 3, explicitVendorItemIds: [] }], ownItems: [] };
    const chunk = { chunkKind: 'keyword_serp', sequence: 1, itemCount: 1, payload: [capture({ stopReason: 'provider_wall' })] };
    expect(() => assembleKeywordSerpCaptures(plan, [chunk])).toThrow(expect.objectContaining({ code: 'ADVERTISING_COLLECTION_INCOMPLETE' }));
  });
});
