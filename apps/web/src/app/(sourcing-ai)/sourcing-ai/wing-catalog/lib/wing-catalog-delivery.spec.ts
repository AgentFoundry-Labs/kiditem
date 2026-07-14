import { describe, expect, it } from 'vitest';
import { buildCoupangProductUrl, buildCoupangReviewUrl } from './wing-catalog-delivery';
import type { WingCatalogProduct } from './wing-catalog-extension';

function makeRow(overrides: Partial<WingCatalogProduct>): WingCatalogProduct {
  return {
    productId: '123',
    itemId: null,
    vendorItemId: null,
    productName: '테스트 상품',
    itemName: null,
    brandName: null,
    manufacture: null,
    categoryHierarchy: null,
    imagePath: null,
    salePrice: null,
    rating: null,
    ratingCount: null,
    pvLast28Day: null,
    salesLast28d: null,
    estimatedRevenue28d: null,
    conversionRate28d: null,
    deliveryInfo: null,
    ...overrides,
  };
}

describe('buildCoupangProductUrl', () => {
  it('productId만 있으면 기본 URL', () => {
    expect(buildCoupangProductUrl(makeRow({ productId: '999' }))).toBe('https://www.coupang.com/vp/products/999');
  });

  it('itemId/vendorItemId 있으면 쿼리로 붙인다', () => {
    const url = buildCoupangProductUrl(makeRow({ productId: '999', itemId: '111', vendorItemId: '222' }));
    expect(url).toBe('https://www.coupang.com/vp/products/999?itemId=111&vendorItemId=222');
  });

  it('productId 없으면 null', () => {
    expect(buildCoupangProductUrl(makeRow({ productId: '' }))).toBeNull();
  });

  it('리뷰 URL은 #sdpReview 앵커를 붙인다', () => {
    expect(buildCoupangReviewUrl(makeRow({ productId: '999' }))).toContain('#sdpReview');
  });
});
