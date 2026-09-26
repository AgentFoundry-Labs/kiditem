import { describe, expect, it } from 'vitest';
import { OperationKindSchema, OperationLockKeySchema } from './operation.js';
import {
  ADVERTISING_KEYWORD_OPERATION_KINDS,
  CompetitorCatalogItemSchema,
  CompetitorCatalogScopeSchema,
  CompetitorSellerIdentityItemSchema,
  WingRankScopeSchema,
  WingTrackedProductsScopeSchema,
  advertisingKeywordIdentity,
  keywordLockKey,
} from './advertising-operations.js';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

describe('advertising keyword operation kinds (KID-362 K-a)', () => {
  it('every kind name satisfies the operation contract kind grammar', () => {
    for (const kind of ADVERTISING_KEYWORD_OPERATION_KINDS) expect(OperationKindSchema.parse(kind)).toBe(kind);
    expect(new Set(ADVERTISING_KEYWORD_OPERATION_KINDS).size).toBe(ADVERTISING_KEYWORD_OPERATION_KINDS.length);
  });

  it('tracked products scope canonicalises keywords, drops case-duplicates and keeps the 12-keyword limit', () => {
    const scope = WingTrackedProductsScopeSchema.parse({ channelAccountId: ACCOUNT, keywords: ['  아기  물티슈 ', 'Baby', 'baby'] });
    expect(scope.keywords).toEqual(['아기 물티슈', 'Baby']);
    expect(WingTrackedProductsScopeSchema.safeParse({ channelAccountId: ACCOUNT, keywords: Array.from({ length: 13 }, (_, i) => `k${i}`) }).success).toBe(false);
    expect(WingTrackedProductsScopeSchema.safeParse({ keywords: ['a'] }).success).toBe(false);
    expect(advertisingKeywordIdentity(' Baby  Wipes ')).toBe('baby wipes');
  });

  it('keyword lock keys satisfy the lock key grammar and fold case and spacing into one rank slot', () => {
    expect(keywordLockKey(' Baby  Wipes ')).toBe('resource:keyword:baby_wipes');
    expect(OperationLockKeySchema.parse(keywordLockKey('아기 물티슈'))).toBe('resource:keyword:아기_물티슈');
    expect(WingRankScopeSchema.parse({ channelAccountId: ACCOUNT })).toEqual({ channelAccountId: ACCOUNT });
  });

  it('bounds competitor catalog rows to an exact seller shop and identity-bearing products (moved from the sourcing subpath)', () => {
    const catalog = {
      keyword: '슬라임',
      sellerId: 'A00219251',
      sellerName: '슬라임 공방',
      sellerStoreUrl: 'https://shop.coupang.com/A00219251',
      totalProductCount: 1,
      collectedProductCount: 1,
      isTruncated: false,
      sort: 'newest' as const,
      capturedAt: '2026-08-14T00:00:30.000Z',
      products: [{ sourceRank: 1, productId: '123', itemId: null, vendorItemId: '456', name: '슬랑이', priceKrw: 12_000, reviewCount: 4, imageUrl: null, link: 'https://www.coupang.com/vp/products/123' }],
    };
    expect(CompetitorCatalogItemSchema.parse(catalog)).toEqual(catalog);
    const product = catalog.products[0]!;
    for (const invalid of [
      { ...catalog, sellerId: 'seller id' },
      { ...catalog, sellerStoreUrl: 'https://example.com/A00219251' },
      { ...catalog, products: [] },
      { ...catalog, url: 'https://example.com' },
      { ...catalog, collectedProductCount: 2 },
      { ...catalog, products: [{ ...product, sourceRank: 501 }] },
      { ...catalog, products: [{ ...product, productId: null, vendorItemId: null }] },
    ]) {
      expect(CompetitorCatalogItemSchema.safeParse(invalid).success).toBe(false);
    }
    expect(CompetitorCatalogScopeSchema.safeParse({ sellerId: 'A1', rankEnrichment: true }).success).toBe(false);
  });

  it('accepts a seller identity only with the seller\'s own shop url', () => {
    const identity = { keyword: '슬라임', productKey: 'vendor-item:1', productId: '1', vendorItemId: '1', link: 'https://www.coupang.com/vp/products/1',
      sellerName: '판매자', sellerId: 'A1', sellerStoreUrl: 'https://shop.coupang.com/vid/A1', capturedAt: '2026-08-14T00:00:30.000Z' };
    expect(CompetitorSellerIdentityItemSchema.safeParse(identity).success).toBe(true);
    expect(CompetitorSellerIdentityItemSchema.safeParse({ ...identity, sellerStoreUrl: 'https://shop.coupang.com/vid/B2' }).success).toBe(false);
  });
});
