import { describe, expect, it } from 'vitest';
import {
  buildWingCatalogSummary,
  formatWingCatalogRate,
  resolveCoupangCatalogImageUrl,
  sortWingCatalogRows,
  type WingCatalogProduct,
} from './wing-catalog-presenter';

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

describe('Wing catalog presenter', () => {
  it('summarizes persisted catalog rows without browser collection behavior', () => {
    expect(buildWingCatalogSummary(rows)).toEqual({
      totalProducts: 2,
      totalSalesLast28d: 30,
      totalRevenueLast28d: 70000,
      totalViewsLast28d: 150,
      averageConversionRate28d: 0.25,
    });
  });

  it('sorts display rows without mutating the persisted snapshot order', () => {
    expect(sortWingCatalogRows(rows, 'revenue').map((row) => row.productId)).toEqual([
      'p2',
      'p1',
    ]);
    expect(rows.map((row) => row.productId)).toEqual(['p1', 'p2']);
  });

  it('formats safe image and rate display values', () => {
    expect(resolveCoupangCatalogImageUrl('vendor_inventory/a.jpg')).toBe(
      'https://thumbnail10.coupangcdn.com/thumbnails/remote/160x160ex/image/vendor_inventory/a.jpg',
    );
    expect(formatWingCatalogRate(0.0785)).toBe('7.9%');
  });
});
