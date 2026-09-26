import {
  COMPETITOR_CATALOG_KIND,
  COMPETITOR_SELLER_IDENTITY_KIND,
  KEYWORD_SERP_KIND,
  WING_ITEMWINNER_KIND,
  WING_RANK_KIND,
  WING_TRACKED_PRODUCTS_KIND,
  WING_TRAFFIC_KIND,
} from '@kiditem/shared/advertising-operations';
import {
  MALL_ADMIN_LISTINGS_KIND,
  ROCKET_MATCHING_CSV_KIND,
  SABANGNET_MALL_LISTINGS_KIND,
} from '@kiditem/shared/channels-operations';
import {
  WING_CATALOG_DETAILS_KIND,
  WING_CATALOG_EXCEL_KIND,
  WING_CATALOG_LIST_KIND,
} from '@kiditem/shared/coupang-catalog-snapshot';
import {
  COUPANG_DIRECTSHIP_KIND,
  COUPANG_ROCKET_PO_KIND,
  COUPANG_SHIPMENT_SUMMARY_KIND,
  MALL_ORDERS_KIND,
  SELLPIA_SHIPMENT_TRACKING_KIND,
} from '@kiditem/shared/orders-operations';
import { COUPANG_REVIEWS_KIND } from '@kiditem/shared/reviews';
import {
  SELLPIA_INVENTORY_KIND,
  SELLPIA_MANUAL_MATCH_KIND,
  SELLPIA_PRODUCT_PROFITABILITY_KIND,
  SELLPIA_SALES_KIND,
} from '@kiditem/shared/sellpia-operations';
import { SOURCING_OPERATION_KINDS } from '@kiditem/shared/sourcing-operation';

/**
 * 실행 계약(ADR-0025)으로 옮긴 kind → 실패 알림이 보내는 화면(KID-355 정책 B). 옮긴 kind의 실패는 `operations` 행에만
 * 남고 알림 reader가 이 kind들의 실행을 읽어 알림으로 만든다. 새 kind를 옮기면 여기 한 줄, 이름은 shared
 * `SOURCE_LABELS`에 한 줄. 서버가 도는 AI 작업(`content.*`)은 자기 생성 기록에 실패를 적으므로 여기 없다.
 */
export const OPERATION_FAILURE_HREFS: Readonly<Record<string, string>> = {
  // wave1 — 카탈로그 · 상품평 · 소싱 확장 6종
  [WING_CATALOG_LIST_KIND]: '/mall-channels',
  [WING_CATALOG_DETAILS_KIND]: '/mall-channels',
  [WING_CATALOG_EXCEL_KIND]: '/mall-channels',
  [COUPANG_REVIEWS_KIND]: '/reviews',
  [SOURCING_OPERATION_KINDS.wingCatalog]: '/sourcing-ai/wing-catalog',
  [SOURCING_OPERATION_KINDS.coupangKeywordSuggestion]: '/sourcing-ai/market',
  [SOURCING_OPERATION_KINDS.trend1688]: '/sourcing-ai/market',
  [SOURCING_OPERATION_KINDS.liveCommerce]: '/sourcing-ai/market',
  [SOURCING_OPERATION_KINDS.tiktokCreative]: '/sourcing-ai/market',
  [SOURCING_OPERATION_KINDS.productExtension]: '/sourcing-ai',
  // wave2 — 주문 수집
  [COUPANG_SHIPMENT_SUMMARY_KIND]: '/coupang-shipments',
  [COUPANG_ROCKET_PO_KIND]: '/rocket-orders',
  [COUPANG_DIRECTSHIP_KIND]: '/order-collection',
  [SELLPIA_SHIPMENT_TRACKING_KIND]: '/order-collection',
  [MALL_ORDERS_KIND]: '/order-collection',
  // wave3 — 셀피아 · 채널 가져오기 · 광고
  [SELLPIA_INVENTORY_KIND]: '/product-hub',
  [SELLPIA_SALES_KIND]: '/stock-ops',
  [SELLPIA_PRODUCT_PROFITABILITY_KIND]: '/stock-ops',
  [SELLPIA_MANUAL_MATCH_KIND]: '/product-hub/matching',
  [SABANGNET_MALL_LISTINGS_KIND]: '/mall-channels',
  [MALL_ADMIN_LISTINGS_KIND]: '/mall-channels',
  [ROCKET_MATCHING_CSV_KIND]: '/product-hub/matching',
  [WING_TRACKED_PRODUCTS_KIND]: '/sourcing-ai/product-tracking',
  [WING_RANK_KIND]: '/rank-tracking',
  [KEYWORD_SERP_KIND]: '/rank-tracking',
  [COMPETITOR_SELLER_IDENTITY_KIND]: '/rank-tracking',
  [COMPETITOR_CATALOG_KIND]: '/sourcing-ai/competitor-analysis',
  [WING_TRAFFIC_KIND]: '/ad-ops',
  [WING_ITEMWINNER_KIND]: '/ad-ops',
};

export const OPERATION_FAILURE_KINDS: readonly string[] = Object.keys(OPERATION_FAILURE_HREFS);

/**
 * 실행은 실패로 닫혔지만 원천이 실패한 것이 아닌 코드 — 알림이 아니다(취소 `*_CANCELLED`와 같은 자리). 이미 수집한 원본을
 * 다시 넣으려던 소싱 상품 수집(KID-313)은 옛 owner도 알림을 남기지 않았다.
 */
export const OPERATION_FAILURE_IGNORED_CODES: readonly string[] = ['SOURCING_DUPLICATE_RECORD'];
