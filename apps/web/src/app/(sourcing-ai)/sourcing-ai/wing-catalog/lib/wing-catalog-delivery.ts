import type { WingCatalogProduct } from './wing-catalog-extension';

/** 쿠팡 상품 상세 URL. itemId/vendorItemId 가 있으면 옵션까지 지정한다. */
export function buildCoupangProductUrl(
  row: Pick<WingCatalogProduct, 'productId' | 'itemId' | 'vendorItemId'>,
): string | null {
  if (!row.productId) return null;
  const params = new URLSearchParams();
  if (row.itemId) params.set('itemId', row.itemId);
  if (row.vendorItemId) params.set('vendorItemId', row.vendorItemId);
  const query = params.toString();
  return `https://www.coupang.com/vp/products/${row.productId}${query ? `?${query}` : ''}`;
}

/** 쿠팡 상품 리뷰 섹션으로 바로 가는 URL(#sdpReview). */
export function buildCoupangReviewUrl(
  row: Pick<WingCatalogProduct, 'productId' | 'itemId' | 'vendorItemId'>,
): string | null {
  const base = buildCoupangProductUrl(row);
  return base ? `${base}${base.includes('?') ? '&' : '?'}#sdpReview` : null;
}
