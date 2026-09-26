import { ERROR_DEFINITIONS, resolveErrorCode, type KiditemErrorCode } from './definitions.js';
import type {
  COMPETITOR_CATALOG_KIND,
  COMPETITOR_SELLER_IDENTITY_KIND,
  KEYWORD_SERP_KIND,
  WING_ITEMWINNER_KIND,
  WING_RANK_KIND,
  WING_TRACKED_PRODUCTS_KIND,
  WING_TRAFFIC_KIND,
} from '../schemas/advertising-operations.js';
import type {
  MALL_ADMIN_LISTINGS_KIND,
  ROCKET_MATCHING_CSV_KIND,
  SABANGNET_MALL_LISTINGS_KIND,
} from '../schemas/channels-operations.js';
import type {
  WING_CATALOG_DETAILS_KIND,
  WING_CATALOG_EXCEL_KIND,
  WING_CATALOG_LIST_KIND,
} from '../schemas/coupang-catalog-snapshot.js';
import type {
  COUPANG_DIRECTSHIP_KIND,
  COUPANG_ROCKET_PO_KIND,
  COUPANG_SHIPMENT_SUMMARY_KIND,
  MALL_ORDERS_KIND,
  SELLPIA_SHIPMENT_TRACKING_KIND,
} from '../schemas/orders-operations.js';
import type { COUPANG_REVIEWS_KIND } from '../schemas/reviews.js';
import type {
  SELLPIA_INVENTORY_KIND,
  SELLPIA_MANUAL_MATCH_KIND,
  SELLPIA_PRODUCT_PROFITABILITY_KIND,
  SELLPIA_SALES_KIND,
} from '../schemas/sellpia-operations.js';
import type { SourcingExtensionKind } from '../schemas/sourcing-operation.js';

/**
 * 실행 계약(ADR-0025)으로 옮긴 kind — 옮긴 kind의 실패는 알림 reader가 실행 표에서 읽어 `sourceType`에 kind를 싣는다
 * (KID-355). 키는 shared kind 상수의 타입으로 맞춘다: kind 이름이 바뀌거나 빠지면 `satisfies`가 tsc에서 막는다
 * (런타임 import 없음 — 운영자 문장 모듈이 스키마를 끌어오지 않는다).
 */
export type OperationFailureKind =
  | typeof WING_CATALOG_LIST_KIND
  | typeof WING_CATALOG_DETAILS_KIND
  | typeof WING_CATALOG_EXCEL_KIND
  | typeof SABANGNET_MALL_LISTINGS_KIND
  | typeof MALL_ADMIN_LISTINGS_KIND
  | typeof SELLPIA_MANUAL_MATCH_KIND
  | typeof ROCKET_MATCHING_CSV_KIND
  | typeof COUPANG_REVIEWS_KIND
  | typeof COUPANG_SHIPMENT_SUMMARY_KIND
  | typeof COUPANG_ROCKET_PO_KIND
  | typeof COUPANG_DIRECTSHIP_KIND
  | typeof SELLPIA_SHIPMENT_TRACKING_KIND
  | typeof MALL_ORDERS_KIND
  | SourcingExtensionKind
  | typeof SELLPIA_INVENTORY_KIND
  | typeof SELLPIA_SALES_KIND
  | typeof SELLPIA_PRODUCT_PROFITABILITY_KIND
  | typeof WING_TRACKED_PRODUCTS_KIND
  | typeof WING_RANK_KIND
  | typeof KEYWORD_SERP_KIND
  | typeof COMPETITOR_SELLER_IDENTITY_KIND
  | typeof COMPETITOR_CATALOG_KIND
  | typeof WING_TRAFFIC_KIND
  | typeof WING_ITEMWINNER_KIND;

const OPERATION_KIND_LABELS = {
  'channels.wing_catalog_list': '쿠팡 윙 상품 목록 수집',
  'channels.wing_catalog_details': '쿠팡 윙 상품 상세 수집',
  'channels.wing_catalog_excel': '쿠팡 윙 상품 엑셀 가져오기',
  'channels.sabangnet_mall_listings': '사방넷 등록 상품 가져오기',
  'channels.mall_admin_listings': '몰 등록 상품 가져오기',
  'channels.sellpia_manual_match': '셀피아 수동 매칭',
  'channels.rocket_matching_csv': '로켓 매칭 파일 가져오기',
  'orders.coupang_reviews': '쿠팡 리뷰 수집',
  'orders.coupang_shipment_summary': '쿠팡 쉽먼트 조회',
  'orders.coupang_rocket_po': '로켓 발주 수집',
  'orders.coupang_directship': '쿠팡 직배송 주문 수집',
  'orders.sellpia_shipment_tracking': '셀피아 배송 추적',
  'orders.mall_orders': '몰 주문 수집',
  'sourcing.wing_catalog': '쿠팡 윙 카탈로그 소싱 수집',
  'sourcing.coupang_keyword_suggestion': '쿠팡 키워드 제안 수집',
  'sourcing.trend_1688': '1688 인기상품 수집',
  'sourcing.live_commerce': '라이브커머스 수집',
  'sourcing.tiktok_creative': '틱톡 크리에이티브 수집',
  'sourcing.product_extension': '도매 상품 수집',
  'products.sellpia_inventory': '셀피아 재고 수집',
  'analytics.sellpia_sales': '셀피아 매출 수집',
  'analytics.sellpia_product_profitability': '셀피아 상품 수익성 수집',
  'advertising.wing_tracked_products': '쿠팡 윙 추적 상품 수집',
  'advertising.wing_rank': '쿠팡 윙 순위 수집',
  'advertising.keyword_serp': '키워드 검색 결과 수집',
  'advertising.competitor_seller_identity': '경쟁 판매자 확인',
  'advertising.competitor_catalog': '경쟁 판매자 상품 수집',
  'advertising.wing_traffic': '쿠팡 윙 트래픽 수집',
  'advertising.wing_itemwinner': '아이템위너 수집',
} as const satisfies Record<OperationFailureKind, string>;

/** 원천 식별자 → 운영자에게 보이는 이름. 모르는 원천은 "수집". 새 원천은 여기 한 줄. */
export const SOURCE_LABELS: Readonly<Record<string, string>> = {
  coupang_wing_catalog: 'Wing 상품 목록 수집',
  coupang_wing_traffic: 'Wing 트래픽 수집',
  coupang_ad_campaign: '광고 캠페인 수집',
  coupang_ad_keyword: '광고 키워드 수집',
  coupang_itemwinner: '아이템위너 수집',
  coupang_review: '쿠팡 리뷰 수집',
  coupang_direct_order: '쿠팡 직배송 주문 수집',
  rocket_po: '로켓 발주 수집',
  order_collection: '주문 수집',
  sellpia_inventory: '셀피아 재고 수집',
  sellpia_sales: '셀피아 매출 수집',
  sellpia_profitability: '셀피아 수익성 수집',
  sellpia_shipment_tracking: '셀피아 배송 추적',
  sellpia_manual_match: '셀피아 수동 매칭',
  competitor_catalog: '경쟁사 상품 수집',
  wing_tracked_product: 'Wing 추적 상품 수집',
  wing_rank: 'Wing 순위 수집',
  keyword_serp: '키워드 검색 결과 수집',
  sourcing_browser: '소싱 수집',
  // 서버 source owner가 실제로 쓰는 sourceType (알림 제목·일반 문장의 주어)
  coupang_wing_tracked_products: 'Wing 추적 상품 수집',
  coupang_competitor_catalog: '경쟁 판매자 수집',
  coupang_competitor_seller_identity: '경쟁 판매자 확인',
  coupang_ad_profitability: '광고 수익성 수집',
  coupang_wing_itemwinner: '아이템위너 수집',
  coupang_keyword_serp: '키워드 검색 결과 수집',
  coupang_wing_rank: 'Wing 순위 수집',
  coupang_reviews: '쿠팡 리뷰 수집',
  coupang_rocket_po_catalog: '로켓 발주 수집',
  coupang_shipment_summary: '쿠팡 쉽먼트 조회',
  coupang_direct_order_capture: '쿠팡 직배송 주문 수집',
  order_collection_mall: '주문 수집',
  sellpia_sales_daily: '셀피아 판매 현황 수집',
  sellpia_product_profitability: '셀피아 수익성 수집',
  mall_admin_listings: '몰 등록 상품 가져오기',
  sabangnet_mall_listings: '사방넷 등록 상품 가져오기',
  ...OPERATION_KIND_LABELS,
};

export function sourceLabel(source: string | null | undefined): string {
  if (!source) return '수집';
  return SOURCE_LABELS[source] ?? SOURCE_LABELS[source.toLowerCase().replace(/[-\s]+/g, '_')] ?? '수집';
}

export interface OperatorErrorInput {
  /** 서버·확장이 보낸 코드. 등록 코드·alias·소문자 철자 모두 받는다. */
  readonly code: unknown;
  /** 원천 식별자(`sourceType` 등). 모르는 코드일 때 일반 문장의 주어가 된다. */
  readonly source?: string | null;
}

/**
 * 운영자에게 보이는 오류 문장 하나. 알려진 코드는 레지스트리 문장, 모르는 코드는 원천별 일반 문장.
 * 원문(`errorMessage`)은 절대 돌려주지 않는다 — 그것이 영어·변수명이 화면에 새던 경로다.
 */
export function operatorErrorText(input: OperatorErrorInput): string {
  const code = resolveErrorCode(input.code);
  if (code) return ERROR_DEFINITIONS[code].text;
  return `${sourceLabel(input.source)} 작업이 실패했습니다. 다시 시도해 주세요.`;
}

/** 코드를 풀어 `{ code, text }`를 낸다. 모르는 코드는 `code: null`. 화면이 kind로 분기할 때 쓴다. */
export function describeOperatorError(input: OperatorErrorInput): { code: KiditemErrorCode | null; text: string } {
  const code = resolveErrorCode(input.code);
  return { code, text: operatorErrorText(input) };
}
