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
  WING_ITEMWINNER_KIND,
  WING_TRAFFIC_KIND,
  WING_TRAFFIC_MAX_COLLECTION_DAYS,
  WingTrafficRowSchema,
  WingTrafficScopeSchema,
  adTrafficReconciliationStatus,
  dailyTrafficFactSource,
  WingItemwinnerRowSchema,
  WingItemwinnerScopeSchema,
  wingDailyLockKey,
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

describe('Wing daily fact kinds (KID-362 K-b)', () => {
  it('kinds are Advertising contract kinds and the daily lock is one resource key per account', () => {
    expect(OperationKindSchema.parse(WING_ITEMWINNER_KIND)).toBe('advertising.wing_itemwinner');
    expect(OperationLockKeySchema.parse(wingDailyLockKey(ACCOUNT))).toBe(`resource:wing-daily:${ACCOUNT}`);
  });

  it('itemwinner scope names exactly one account', () => {
    expect(WingItemwinnerScopeSchema.parse({ channelAccountId: ACCOUNT })).toEqual({ channelAccountId: ACCOUNT });
    expect(WingItemwinnerScopeSchema.safeParse({}).success).toBe(false);
    expect(WingItemwinnerScopeSchema.safeParse({ channelAccountId: ACCOUNT, url: 'https://x' }).success).toBe(false);
  });

  it('itemwinner rows carry the provider option id and integer prices only', () => {
    const row = { vendorItemId: '101', productName: '상품', isWinner: true, myPrice: 1000, winnerPrice: 900, salesQty: 2, suppressed: false, providerWinnerStatus: true };
    expect(WingItemwinnerRowSchema.parse(row)).toEqual(row);
    expect(WingItemwinnerRowSchema.safeParse({ ...row, vendorItemId: 'A1' }).success).toBe(false);
    expect(WingItemwinnerRowSchema.safeParse({ ...row, myPrice: 10.5 }).success).toBe(false);
  });
});

describe('Wing traffic kind (KID-362 K6)', () => {
  it('is an Advertising kind with the daily lock of its account and a 92-day start limit', () => {
    expect(OperationKindSchema.parse(WING_TRAFFIC_KIND)).toBe('advertising.wing_traffic');
    expect(WING_TRAFFIC_MAX_COLLECTION_DAYS).toBe(92);
  });

  it('scope names the account and an optional ordered closed range', () => {
    expect(WingTrafficScopeSchema.safeParse({ channelAccountId: ACCOUNT }).success).toBe(true);
    expect(WingTrafficScopeSchema.safeParse({ channelAccountId: ACCOUNT, startDate: '2026-09-01', endDate: '2026-09-07' }).success).toBe(true);
    expect(WingTrafficScopeSchema.safeParse({ channelAccountId: ACCOUNT, startDate: '2026-09-07', endDate: '2026-09-01' }).success).toBe(false);
    expect(WingTrafficScopeSchema.safeParse({ startDate: '2026-09-01' }).success).toBe(false);
    expect(WingTrafficScopeSchema.safeParse({ channelAccountId: ACCOUNT, url: 'https://wing.coupang.com' }).success).toBe(false);
  });

  it('a traffic row is one option-day with integer metrics', () => {
    const row = { businessDate: '2026-09-01', vendorItemId: '101', productId: '55', visitors: 1, views: 2, cartAdds: 0, orders: 0, salesQty: 0, revenue: 0 };
    expect(WingTrafficRowSchema.parse(row)).toEqual(row);
    expect(WingTrafficRowSchema.safeParse({ ...row, vendorItemId: '0' }).success).toBe(false);
    expect(WingTrafficRowSchema.safeParse({ ...row, views: 1.5 }).success).toBe(false);
  });
});

describe('adTrafficReconciliationStatus', () => {
  it('derives the word from the two measured totals only', () => {
    expect(adTrafficReconciliationStatus({ dailySum: 20, periodValue: 20 })).toBe('MATCHED');
    expect(adTrafficReconciliationStatus({ dailySum: 0, periodValue: 1 })).toBe('MISMATCH');
    expect(adTrafficReconciliationStatus({ dailySum: 0, periodValue: null })).toBe('UNVERIFIED');
    expect(adTrafficReconciliationStatus({ dailySum: null, periodValue: 0 })).toBe('UNVERIFIED');
  });
});

describe('dailyTrafficFactSource', () => {
  it('names the writer of a traffic fact from its namespace or its active marker', () => {
    expect(dailyTrafficFactSource({ 'wing.traffic': { grain: 'listing_option_sum' } })).toBe('wing');
    expect(dailyTrafficFactSource({ source: 'wing.traffic', data: { periodDays: 7 } })).toBe('wing');
    expect(dailyTrafficFactSource(null)).toBeNull();
    expect(dailyTrafficFactSource({})).toBeNull();
    expect(dailyTrafficFactSource({ 'traffic.currentSource': 'wing.traffic', 'wing.traffic': {} })).toBe('wing');
    expect(dailyTrafficFactSource({ 'traffic.currentSource': 'unknown' })).toBeNull();
  });

  /** 트래픽 CSV 업로드 lane 은 없다(KID-110) — Wing 이 리스팅-일 트래픽의 유일한 작성자다. */
  it('reads any other marker as no known writer', () => {
    expect(dailyTrafficFactSource({ 'traffic.future_source': { data: {} } })).toBeNull();
    expect(dailyTrafficFactSource({ 'wing.traffic': { grain: 'listing_option_sum' }, 'traffic.future_source': { data: {} } })).toBe('wing');
  });
});
