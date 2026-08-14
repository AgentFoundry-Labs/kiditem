import { describe, expect, it } from 'vitest';
import {
  AdvertisingCompetitorCatalogInputSchema,
  AdvertisingCompetitorCatalogBatchSchema,
  AdvertisingTrackedWingProductsInputSchema,
  SourcingKeywordSuggestionInputSchema,
  SourcingKeywordSuggestionSnapshotSchema,
  SourcingWingCatalogBatchInputSchema,
  SourcingWingCatalogBatchResultSchema,
  SourcingWingCatalogFinalizeSchema,
  SourcingWingCatalogObservationBatchSchema,
  SourcingWingCatalogSnapshotSchema,
  canonicalizeSourcingWingCatalogKeyword,
  sourcingWingCatalogKeywordIdentity,
} from './browser-operations.js';

const keywordResult = {
  keyword: '슬라임',
  outcome: 'complete',
  discovered: 2,
  accepted: 2,
  duplicate: 0,
  failed: 0,
} as const;

const observation = {
  productId: '123',
  itemId: null,
  vendorItemId: '456',
  productName: '슬라임 세트',
  itemName: '기본',
  brandName: '키드아이템',
  manufacture: null,
  categoryHierarchy: '장난감 > 미술놀이',
  imagePath: 'catalog/example.jpg',
  salePriceKrw: 12_000,
  ratingAverage: 4.5,
  ratingCount: 10,
  viewsLast28d: 100,
  salesLast28d: 20,
  estimatedRevenue28d: 240_000,
  conversionRate28d: 0.2,
  deliveryInfo: '로켓배송',
  sourceKeyword: '슬라임',
  capturedAt: '2026-08-14T00:00:00.000Z',
} as const;

describe('Wing catalog browser-operation contracts', () => {
  it('accepts only an exact bounded tracked-products batch', () => {
    expect(AdvertisingTrackedWingProductsInputSchema.parse({
      keywords: ['  Ａ   Pencil  ', '키워드'],
      maxPages: 2,
      purpose: 'tracked_metrics',
      trackedProductIds: ['wing-1', 'wing-2'],
    })).toEqual({
      keywords: ['A Pencil', '키워드'],
      maxPages: 2,
      purpose: 'tracked_metrics',
      trackedProductIds: ['wing-1', 'wing-2'],
    });

    for (const invalid of [
      { keywords: ['x'], maxPages: 2, purpose: 'catalog_search', trackedProductIds: ['wing-1'] },
      { keywords: ['x'], maxPages: 2, purpose: 'tracked_metrics', trackedProductIds: [] },
      { keywords: ['x'], maxPages: 2, purpose: 'tracked_metrics', trackedProductIds: ['wing-1', 'wing-1'] },
      { keywords: ['x'], maxPages: 2, purpose: 'tracked_metrics', trackedProductIds: ['wing-1'], url: 'https://wing.coupang.com' },
    ]) {
      expect(AdvertisingTrackedWingProductsInputSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('accepts only a strict bounded batch input and trims keywords', () => {
    expect(SourcingWingCatalogBatchInputSchema.parse({
      keywords: ['  슬라임  ', '클레이'],
      maxPages: 5,
      purpose: 'catalog_search',
    })).toEqual({
      keywords: ['슬라임', '클레이'],
      maxPages: 5,
      purpose: 'catalog_search',
    });

    for (const invalid of [
      { keywords: [], maxPages: 1, purpose: 'catalog_search' },
      { keywords: Array.from({ length: 13 }, (_, index) => `k${index}`), maxPages: 1, purpose: 'catalog_search' },
      { keywords: [' '], maxPages: 1, purpose: 'catalog_search' },
      { keywords: ['x'.repeat(101)], maxPages: 1, purpose: 'catalog_search' },
      { keywords: ['x'], maxPages: 0, purpose: 'catalog_search' },
      { keywords: ['x'], maxPages: 6, purpose: 'catalog_search' },
      { keywords: ['x'], maxPages: 1.5, purpose: 'catalog_search' },
      { keywords: ['x'], maxPages: 1, purpose: 'generic_action' },
      { keywords: ['x'], maxPages: 1, purpose: 'catalog_search', actionUrl: 'https://example.com' },
    ]) {
      expect(SourcingWingCatalogBatchInputSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('canonicalizes NFKC and whitespace while preserving display case and order', () => {
    expect(canonicalizeSourcingWingCatalogKeyword('  Ａ\u00a0  Pencil  '))
      .toBe('A Pencil');
    expect(sourcingWingCatalogKeywordIdentity('  Ａ\u00a0  Pencil  '))
      .toBe('a pencil');
    expect(SourcingWingCatalogBatchInputSchema.parse({
      keywords: ['  Ｂ  ', 'Ａ Pencil'],
      maxPages: 1,
      purpose: 'catalog_search',
    }).keywords).toEqual(['B', 'A Pencil']);
  });

  it.each([
    [['A', 'a']],
    [['Ａ', 'A']],
    [['A  Pencil', 'ａ pencil']],
  ])('rejects normalized duplicate keywords before durable run creation: %j', (keywords) => {
    expect(SourcingWingCatalogBatchInputSchema.safeParse({
      keywords,
      maxPages: 1,
      purpose: 'catalog_search',
    }).success).toBe(false);
  });

  it('applies keyword length bounds after canonicalization', () => {
    expect(SourcingWingCatalogBatchInputSchema.safeParse({
      keywords: [`${'a'.repeat(99)}  `],
      maxPages: 1,
      purpose: 'catalog_search',
    }).success).toBe(true);
    expect(SourcingWingCatalogBatchInputSchema.safeParse({
      keywords: ['a'.repeat(101)],
      maxPages: 1,
      purpose: 'catalog_search',
    }).success).toBe(false);
  });

  it.each([
    'catalog_search',
    'market_analysis',
    'recommendation_validation',
    'tracked_metrics',
  ])('accepts the exact %s purpose', (purpose) => {
    expect(SourcingWingCatalogBatchInputSchema.safeParse({
      keywords: ['슬라임'],
      maxPages: 1,
      purpose,
    }).success).toBe(true);
  });

  it('bounds keyword observations, finalization, snapshots, and terminal summaries', () => {
    expect(SourcingWingCatalogObservationBatchSchema.parse({
      keyword: ' 슬라임 ',
      maxPages: 2,
      purpose: 'catalog_search',
      items: [observation],
    })).toMatchObject({
      keyword: '슬라임',
      purpose: 'catalog_search',
      items: [observation],
    });
    expect(SourcingWingCatalogFinalizeSchema.parse({
      purpose: 'catalog_search',
      keywords: [keywordResult],
    })).toEqual({ purpose: 'catalog_search', keywords: [keywordResult] });
    expect(SourcingWingCatalogBatchResultSchema.parse({
      outcome: 'complete',
      summary: { discovered: 2, accepted: 2, duplicate: 0, unchanged: 0, failed: 0 },
      sources: [{ source: 'wing_catalog', outcome: 'complete', accepted: 2, failed: 0 }],
      keywords: [keywordResult],
      snapshotGeneratedAt: '2026-08-14T00:00:00.000Z',
    }).keywords).toEqual([keywordResult]);
    expect(SourcingWingCatalogSnapshotSchema.parse({
      keyword: '슬라임',
      generatedAt: '2026-08-14T00:00:00.000Z',
      items: [observation],
      rejectedCount: 0,
    }).items).toEqual([observation]);
    expect(SourcingWingCatalogSnapshotSchema.parse({
      keyword: '슬라임',
      generatedAt: null,
      items: [],
      rejectedCount: 0,
    }).generatedAt).toBeNull();

    expect(SourcingWingCatalogObservationBatchSchema.safeParse({
      keyword: '슬라임',
      maxPages: 2,
      purpose: 'catalog_search',
      items: [{ ...observation, rawResponse: { cookie: 'secret' } }],
    }).success).toBe(false);
    expect(SourcingWingCatalogObservationBatchSchema.safeParse({
      keyword: '슬라임',
      maxPages: 2,
      items: [observation],
    }).success).toBe(false);
    expect(SourcingWingCatalogBatchResultSchema.safeParse({
      outcome: 'complete',
      summary: { discovered: 1, accepted: 1, duplicate: 0, unchanged: 0, failed: 0 },
      sources: [],
      keywords: [{ ...keywordResult, rows: [observation] }],
      raw: { arbitrary: true },
    }).success).toBe(false);
    expect(SourcingWingCatalogSnapshotSchema.safeParse({
      keyword: '슬라임',
      generatedAt: '2026-08-14T00:00:00.000Z',
      items: Array.from({ length: 401 }, () => observation),
      rejectedCount: 0,
    }).success).toBe(false);
  });
});

describe('keyword and competitor browser-operation contracts', () => {
  it('accepts one canonical keyword and at most 30 keyword suggestions', () => {
    expect(SourcingKeywordSuggestionInputSchema.parse({
      keyword: '  Ａ\u00a0  Pencil  ',
      maxResults: 30,
    })).toEqual({ keyword: 'A Pencil', maxResults: 30 });

    for (const invalid of [
      { keyword: '', maxResults: 30 },
      { keyword: 'x', maxResults: 0 },
      { keyword: 'x', maxResults: 31 },
      { keyword: ['x'], maxResults: 30 },
      { keyword: 'x', maxResults: 30, url: 'https://www.coupang.com' },
      { keyword: 'x', maxResults: 30, action: 'search' },
    ]) {
      expect(SourcingKeywordSuggestionInputSchema.safeParse(invalid).success)
        .toBe(false);
    }

    expect(SourcingKeywordSuggestionSnapshotSchema.parse({
      keyword: ' Ａ Pencil ',
      generatedAt: '2026-08-14T00:00:00.000Z',
      sourceKey: 'coupang.keyword_suggestion',
      schemaVersion: 'coupang-keyword-suggestion/v1',
      items: [{ rank: 1, keyword: '아동 연필', source: 'coupang-autocomplete' }],
      productNameTokens: [{ keyword: '연필', count: 4 }],
    }).keyword).toBe('A Pencil');
    expect(SourcingKeywordSuggestionSnapshotSchema.safeParse({
      keyword: 'x',
      generatedAt: null,
      sourceKey: 'coupang.keyword_suggestion',
      schemaVersion: 'coupang-keyword-suggestion/v1',
      items: Array.from({ length: 31 }, (_, index) => ({
        rank: index + 1,
        keyword: `k${index}`,
        source: 'coupang-search-dom',
      })),
      productNameTokens: [],
    }).success).toBe(false);
  });

  it('allows only a configured watchlist or one validated seller ID', () => {
    expect(AdvertisingCompetitorCatalogInputSchema.parse({
      target: 'configured_watchlist',
    })).toEqual({ target: 'configured_watchlist' });
    expect(AdvertisingCompetitorCatalogInputSchema.parse({
      target: 'seller_id',
      sellerId: ' A00219251 ',
    })).toEqual({ target: 'seller_id', sellerId: 'A00219251' });

    for (const invalid of [
      {},
      { target: 'seller_id' },
      { target: 'seller_id', sellerId: 'https://shop.coupang.com/A00219251' },
      { target: 'seller_id', sellerId: 'seller id' },
      { target: 'configured_watchlist', sellerId: 'A00219251' },
      { target: 'url', url: 'https://shop.coupang.com/A00219251' },
      { target: 'configured_watchlist', action: 'collect' },
    ]) {
      expect(AdvertisingCompetitorCatalogInputSchema.safeParse(invalid).success)
        .toBe(false);
    }
  });

  it('bounds exact competitor catalog owner rows without permitting generic payloads', () => {
    const catalog = {
      keyword: '노루잡화점 크런치 슬랑이',
      sellerId: 'A00219251',
      sellerName: '도그블랑',
      sellerStoreUrl: 'https://shop.coupang.com/A00219251',
      totalProductCount: 1,
      collectedProductCount: 1,
      isTruncated: false,
      sort: 'newest' as const,
      capturedAt: '2026-08-14T00:00:30.000Z',
      products: [{
        sourceRank: 1,
        productId: '123',
        itemId: null,
        vendorItemId: '456',
        name: '슬랑이',
        priceKrw: 12_000,
        reviewCount: 4,
        imageUrl: null,
        link: 'https://www.coupang.com/vp/products/123',
      }],
    };
    expect(AdvertisingCompetitorCatalogBatchSchema.parse({ catalogs: [catalog] }))
      .toEqual({ catalogs: [catalog] });
    for (const invalid of [
      { catalogs: [] },
      { catalogs: [{ ...catalog, sellerId: 'seller id' }] },
      { catalogs: [{ ...catalog, sellerStoreUrl: 'https://example.com/A00219251' }] },
      { catalogs: [{ ...catalog, products: [] }] },
      { catalogs: [{ ...catalog, url: 'https://example.com' }] },
      { catalogs: Array.from({ length: 21 }, () => catalog) },
      { catalogs: [{ ...catalog, products: Array.from({ length: 101 }, () => catalog.products[0]) }] },
    ]) {
      expect(AdvertisingCompetitorCatalogBatchSchema.safeParse(invalid).success)
        .toBe(false);
    }
  });
});
