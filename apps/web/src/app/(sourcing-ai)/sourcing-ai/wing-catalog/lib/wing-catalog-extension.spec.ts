import { describe, expect, it } from 'vitest';
import {
  buildWingCatalogSummary,
  formatWingCatalogRate,
  resolveCoupangCatalogImageUrl,
  sortWingCatalogRows,
  WING_CATALOG_EXTENSION_RELOAD_REQUIRED,
  type WingCatalogProduct,
} from './wing-catalog-extension';
import {
  buildAutocompleteKeywordCandidates,
  buildProductNameKeywordFrequencies,
  buildRelatedKeywordCandidates,
} from './wing-catalog-keyword-insights';

const rows: WingCatalogProduct[] = [
  {
    productId: 'p1',
    itemId: 'i1',
    vendorItemId: 'v1',
    productName: 'A',
    itemName: null,
    brandName: null,
    manufacture: null,
    categoryHierarchy: null,
    imagePath: 'vendor_inventory/a.jpg',
    salePrice: 1000,
    rating: 5,
    ratingCount: 20,
    pvLast28Day: 100,
    salesLast28d: 10,
    estimatedRevenue28d: 10000,
    conversionRate28d: 0.1,
    deliveryInfo: null,
  },
  {
    productId: 'p2',
    itemId: 'i2',
    vendorItemId: 'v2',
    productName: 'B',
    itemName: null,
    brandName: null,
    manufacture: null,
    categoryHierarchy: null,
    imagePath: null,
    salePrice: 3000,
    rating: 4,
    ratingCount: 5,
    pvLast28Day: 50,
    salesLast28d: 20,
    estimatedRevenue28d: 60000,
    conversionRate28d: 0.4,
    deliveryInfo: null,
  },
];

describe('wing catalog extension helpers', () => {
  it('summarizes Wing 28-day catalog metrics', () => {
    expect(buildWingCatalogSummary(rows)).toEqual({
      totalProducts: 2,
      totalSalesLast28d: 30,
      totalRevenueLast28d: 70000,
      totalViewsLast28d: 150,
      averageConversionRate28d: 0.25,
    });
  });

  it('sorts rows by selected metric without mutating source rows', () => {
    expect(sortWingCatalogRows(rows, 'revenue').map((row) => row.productId)).toEqual(['p2', 'p1']);
    expect(rows.map((row) => row.productId)).toEqual(['p1', 'p2']);
  });

  it('resolves relative Coupang image paths and formats conversion rates', () => {
    expect(resolveCoupangCatalogImageUrl('vendor_inventory/a.jpg')).toBe(
      'https://thumbnail10.coupangcdn.com/thumbnails/remote/160x160ex/image/vendor_inventory/a.jpg',
    );
    expect(formatWingCatalogRate(0.0785)).toBe('7.9%');
  });

  it('keeps a specific reload guidance for stale extension versions', () => {
    expect(WING_CATALOG_EXTENSION_RELOAD_REQUIRED).toContain('새로고침');
    expect(WING_CATALOG_EXTENSION_RELOAD_REQUIRED).toContain('chrome://extensions');
  });

  it('builds related keyword insight candidates from catalog product names', () => {
    const insightRows: WingCatalogProduct[] = [
      { ...rows[0], productName: '수채화 팔레트 1개 미술용' },
      { ...rows[1], productName: '팔레트 세트 1개 전문가용' },
      { ...rows[1], productId: 'p3', productName: '수채화파레트 물감 팔레트' },
    ];

    const frequencies = buildProductNameKeywordFrequencies(insightRows, '팔레트');
    const related = buildRelatedKeywordCandidates({
      seedKeyword: '팔레트',
      searchAdKeywords: ['수채화팔레트'],
      productNameKeywords: frequencies.map((item) => item.keyword),
    });
    const autocomplete = buildAutocompleteKeywordCandidates({
      seedKeyword: '팔레트',
      relatedKeywords: related,
    });

    expect(frequencies[0]).toEqual({ keyword: '팔레트', count: 3 });
    expect(related).toContain('수채화팔레트');
    expect(autocomplete[0]).toBe('팔레트 슬라임');
  });
});
