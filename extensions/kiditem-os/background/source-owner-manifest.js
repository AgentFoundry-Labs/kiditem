// Build-time source ownership contract for browser collection producers.
// This manifest is intentionally not loaded by the extension runtime.
export const SOURCE_OWNER_BY_PRODUCER = Object.freeze({
  "advertising.ad_keyword": "advertising",
  "advertising.ad_sync": "advertising",
  "advertising.profitability_import": "advertising",
  "advertising.competitor_catalog": "advertising",
  "advertising.competitor_seller_identity": "advertising",
  "advertising.keyword_rank": "advertising",
  "advertising.wing_rank": "advertising",
  "advertising.wing_tracked_products": "advertising",
  "channels.coupang_catalog": "channels",
  "dashboard.coupang_products": "analytics",
  "inventory.sellpia": "inventory",
  "orders.mall": "orders",
  "orders.sabangnet_mall_listings": "channels",
  "orders.mall_admin_listings": "channels",
  "orders.sellpia_manual_match": "channels",
  "orders.sellpia_product_profitability": "analytics",
  "orders.sellpia_sales": "analytics",
  // 소싱 수집은 브라우저 수집 세션이 아니라 실행 kind `sourcing.*`다(KID-360).
});
