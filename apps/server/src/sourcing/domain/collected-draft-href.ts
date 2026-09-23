/**
 * 수집한 상품 화면 주소. 화면은 판매상품 초안으로 열린다 — 후보 id 로 만든 주소는 열리지 않는다
 * (KID-310 · ADR-0022).
 */
export function collectedDraftHref(salesProductId: string): string {
  return `/product-pipeline/collected-products/${encodeURIComponent(salesProductId)}`;
}
