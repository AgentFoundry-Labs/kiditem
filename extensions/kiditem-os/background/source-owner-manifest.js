// Build-time source ownership contract for browser collection producers.
// This manifest is intentionally not loaded by the extension runtime.
export const SOURCE_OWNER_BY_PRODUCER = Object.freeze({
  "advertising.ad_keyword": "advertising",
  "advertising.ad_sync": "advertising",
  "advertising.profitability_import": "advertising",
  "channels.coupang_catalog": "channels",
  "dashboard.coupang_products": "analytics",
  "orders.mall": "orders",
  "orders.mall_admin_listings": "channels",
  // 소싱 수집은 브라우저 수집 세션이 아니라 실행 kind `sourcing.*`다(KID-360).
});
