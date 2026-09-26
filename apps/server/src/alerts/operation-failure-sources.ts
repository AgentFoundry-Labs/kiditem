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
import type { KiditemErrorCode, OperationFailureKind } from '@kiditem/shared/errors';

/**
 * 실행 계약(ADR-0025)으로 옮긴 kind → 실패 알림이 보내는 화면(KID-355 정책 B). 옮긴 kind의 실패는 `operations` 행에만
 * 남고 알림 reader가 이 kind들의 실행을 읽어 알림으로 만든다. 새 kind를 옮기면 여기 한 줄, 이름은 shared
 * `SOURCE_LABELS`에 한 줄. 서버가 도는 AI 작업(`content.*`)은 자기 생성 기록에 실패를 적으므로 여기 없다.
 */
export const OPERATION_FAILURE_HREFS = {
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
} as const satisfies Record<OperationFailureKind, string>;

/**
 * 한 kind 안에서 원천을 가르는 plan 필드 — 옛 알림 writer의 dedupeKey와 같은 알갱이. 채널 계정 로그인을 쓰는 kind는
 * 계정, 몰마다 도는 kind는 몰, 소싱 키워드 제안은 키워드(`targetKey`), 라이브·상품 수집은 원천(`sourceKey`)이다.
 * 여기 없는 kind는 조직에 원천 하나(kind 하나가 알림 하나)다.
 */
export const OPERATION_FAILURE_SCOPE_FIELDS: Readonly<Partial<Record<OperationFailureKind, string>>> = {
  [WING_CATALOG_LIST_KIND]: 'channelAccountId',
  [WING_CATALOG_DETAILS_KIND]: 'channelAccountId',
  [WING_CATALOG_EXCEL_KIND]: 'channelAccountId',
  [COUPANG_REVIEWS_KIND]: 'channelAccountId',
  [SOURCING_OPERATION_KINDS.wingCatalog]: 'channelAccountId',
  [SOURCING_OPERATION_KINDS.coupangKeywordSuggestion]: 'targetKey',
  [SOURCING_OPERATION_KINDS.liveCommerce]: 'sourceKey',
  [SOURCING_OPERATION_KINDS.productExtension]: 'sourceKey',
  [COUPANG_ROCKET_PO_KIND]: 'channelAccountId',
  [COUPANG_DIRECTSHIP_KIND]: 'channelAccountId',
  [MALL_ORDERS_KIND]: 'mallKey',
  [MALL_ADMIN_LISTINGS_KIND]: 'mallKey',
  [WING_TRACKED_PRODUCTS_KIND]: 'channelAccountId',
  [WING_RANK_KIND]: 'channelAccountId',
  [WING_TRAFFIC_KIND]: 'channelAccountId',
  [WING_ITEMWINNER_KIND]: 'channelAccountId',
};

export const OPERATION_FAILURE_KINDS = Object.keys(OPERATION_FAILURE_HREFS) as OperationFailureKind[];

/** 실행 표에서 읽은 kind의 화면 주소(모르는 kind는 null). */
export function operationFailureHref(kind: string): string | null {
  return (OPERATION_FAILURE_HREFS as Readonly<Record<string, string>>)[kind] ?? null;
}

/**
 * 실행은 실패로 닫혔지만 원천이 실패한 것이 아닌 코드 — 알림이 아니다(취소 `*_CANCELLED`와 같은 자리). 이미 수집한 원본을
 * 다시 넣으려던 소싱 상품 수집(KID-313)은 옛 owner도 알림을 남기지 않았다.
 */
export const OPERATION_FAILURE_IGNORED_CODES = ['SOURCING_DUPLICATE_RECORD'] as const satisfies readonly KiditemErrorCode[];
