import { z } from 'zod';
import { RocketPoSourceBeginSchema } from './rocket-purchase-preview.js';

/**
 * Orders owner의 확장 구동 실행 kind(ADR-0025, KID-359 wave2). scope는 웹이 begin에 싣는 입력이고 owner
 * `plan(scope)`가 검증한다. plan·progress·result의 세부 모양은 kind마다 owner 폴더(`orders/domain`)와 확장
 * 수집기(`extensions/src/collectors/<kind>`)가 정한다 — 여기에는 wire에 함께 쓰는 이름과 scope·result만 둔다.
 * 리뷰 kind는 `@kiditem/shared/reviews`에 그대로 있다(wave1).
 */
export const COUPANG_SHIPMENT_SUMMARY_KIND = 'orders.coupang_shipment_summary' as const;
export const COUPANG_ROCKET_PO_KIND = 'orders.coupang_rocket_po' as const;
export const COUPANG_DIRECTSHIP_KIND = 'orders.coupang_directship' as const;
export const SELLPIA_SHIPMENT_TRACKING_KIND = 'orders.sellpia_shipment_tracking' as const;
export const MALL_ORDERS_KIND = 'orders.mall_orders' as const;

export const ORDERS_OPERATION_KINDS = [
  COUPANG_SHIPMENT_SUMMARY_KIND,
  COUPANG_ROCKET_PO_KIND,
  COUPANG_DIRECTSHIP_KIND,
  SELLPIA_SHIPMENT_TRACKING_KIND,
  MALL_ORDERS_KIND,
] as const;
export type OrdersOperationKind = (typeof ORDERS_OPERATION_KINDS)[number];

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

/** 배송요약: supplier 화면의 택배 목록을 최대 `maxPages`쪽(1–60, 기본 40) 읽는다. lockKey `org`. */
export const CoupangShipmentSummaryScopeSchema = z.object({
  maxPages: z.number().int().min(1).max(60).optional(),
}).strict();
export type CoupangShipmentSummaryScope = z.infer<typeof CoupangShipmentSummaryScopeSchema>;

/** 배송요약 기본 쪽 수(옛 attempt와 같다). */
export const COUPANG_SHIPMENT_SUMMARY_DEFAULT_MAX_PAGES = 40;
/** 쪽이 이보다 적으면 마지막 쪽이다(supplier 목록 한 쪽 = 10행). */
export const COUPANG_SHIPMENT_SUMMARY_PAGE_ROWS = 10;

/** `shipment_dates` 청크 항목: 발송일 하나의 쉽먼트 수·박스 수(확장이 쪽을 모아 발송일별로 센 값). */
export const CoupangShipmentDateItemSchema = z.object({
  date: isoDay,
  count: z.number().int().min(1).max(1_000_000),
  boxes: z.number().int().min(0).max(1_000_000),
}).strict();
export type CoupangShipmentDateItem = z.infer<typeof CoupangShipmentDateItemSchema>;

/**
 * `shipment_scan` 청크 항목(실행당 하나): 읽은 쪽과 멈춘 까닭. 옛 attempt의 제출 증거(`scannedPages`·`totalRows`·`proof`)와 같다.
 * owner finalize가 plan의 쪽 상한과 발송일 항목 합계로 완결을 확인한다.
 */
export const CoupangShipmentScanSchema = z.object({
  maxPages: z.number().int().min(1).max(60),
  scannedPages: z.number().int().min(1).max(60),
  totalRows: z.number().int().min(0),
  stopReason: z.enum(['empty_page', 'short_page', 'max_pages']),
  lastPageRowCount: z.number().int().min(0),
  pageRowCounts: z.array(z.number().int().min(0)).min(1).max(60),
  validatedTable: z.literal(true),
}).strict();
export type CoupangShipmentScan = z.infer<typeof CoupangShipmentScanSchema>;

/** 배송요약 진행: 읽은 쪽 / 쪽 상한. */
export const CoupangShipmentSummaryProgressSchema = z.object({
  current: z.number().int().min(0),
  total: z.number().int().min(1),
}).passthrough();
export type CoupangShipmentSummaryProgress = z.infer<typeof CoupangShipmentSummaryProgressSchema>;

/** 배송요약 result: 저장한 발송일 수와 센 쉽먼트 행 수. */
export const CoupangShipmentSummaryResultSchema = z.object({
  dates: z.number().int().nonnegative(),
  rows: z.number().int().nonnegative(),
}).strict();
export type CoupangShipmentSummaryResult = z.infer<typeof CoupangShipmentSummaryResultSchema>;

/** 로켓 PO: 옛 begin 입력과 같다(계정·기간·상태·날짜 기준·확정 요구). lockKey `account:<channelAccountId>`. */
export const CoupangRocketPoScopeSchema = RocketPoSourceBeginSchema;
export type CoupangRocketPoScope = z.infer<typeof CoupangRocketPoScopeSchema>;

/** directship 캡처: 그 계정의 supplier 화면에서 발주·센터를 읽는다. lockKey `account:<channelAccountId>`. */
export const CoupangDirectshipScopeSchema = z.object({
  channelAccountId: z.string().uuid(),
}).strict();
export type CoupangDirectshipScope = z.infer<typeof CoupangDirectshipScopeSchema>;

/** 셀피아 송장: 주문일 범위. lockKey `org`. */
export const SellpiaShipmentTrackingScopeSchema = z.object({
  startDate: isoDay,
  endDate: isoDay,
}).strict().refine((value) => value.startDate <= value.endDate, 'startDate must not be after endDate');
export type SellpiaShipmentTrackingScope = z.infer<typeof SellpiaShipmentTrackingScopeSchema>;

export const MallOrdersCollectionModeSchema = z.enum(['browser', 'manual-upload']);
export const MallOrdersSelectionModeSchema = z.enum(['manual', 'automatic']);
/** 옛 attempt plan과 같은 상한: 본 행 키 최대 8,000개, 키 하나 2,000자. */
export const MALL_ORDERS_SEEN_ROW_KEYS_MAX = 8_000;
export const MALL_ORDERS_SEEN_ROW_KEY_MAX_LENGTH = 2_000;

/**
 * 몰 주문: 몰 계정 하나의 관리자 화면에서 주문 행을 읽는다. lockKey `account:<channelAccountId>`.
 * `seenRowKeys`는 웹이 브라우저에 기억한 "이미 본 행"(자동 감지)이고 plan에 그대로 실린다.
 */
export const MallOrdersScopeSchema = z.object({
  channelAccountId: z.string().uuid(),
  mallKey: z.string().min(1).max(64),
  collectionDate: isoDay.nullable().default(null),
  collectionMode: MallOrdersCollectionModeSchema,
  selectionMode: MallOrdersSelectionModeSchema.optional(),
  seenRowKeys: z.array(z.string().min(1).max(MALL_ORDERS_SEEN_ROW_KEY_MAX_LENGTH)).max(MALL_ORDERS_SEEN_ROW_KEYS_MAX).optional(),
}).strict();
export type MallOrdersScope = z.infer<typeof MallOrdersScopeSchema>;

/**
 * 몰 주문 kind로 옮긴 몰(1차, KID-359 H3). 여기 없는 몰은 옛 attempt 경로가 H3′까지 받는다 — 웹은 이 목록으로
 * 시작 경로를 가른다(KID-355 2026-09-26 03:27 리더 설계).
 */
export const MALL_ORDER_OPERATION_MALLS = ['icecream-mall', 'kidkids', 'art09', 'domeggook'] as const;
export type MallOrderOperationMall = (typeof MALL_ORDER_OPERATION_MALLS)[number];
export function isMallOrderOperationMall(mallKey: string): mallKey is MallOrderOperationMall {
  return (MALL_ORDER_OPERATION_MALLS as readonly string[]).includes(mallKey);
}

/** 청크 종류(확장 수집기 → owner finalize). */
export const COUPANG_SHIPMENT_SUMMARY_CHUNK_KIND = 'shipment_dates' as const;
export const COUPANG_SHIPMENT_SUMMARY_SCAN_CHUNK_KIND = 'shipment_scan' as const;
export const COUPANG_ROCKET_PO_CHUNK_KIND = 'po_rows' as const;
export const COUPANG_DIRECTSHIP_CHUNK_KIND = 'orders_capture' as const;
export const SELLPIA_SHIPMENT_TRACKING_CHUNK_KIND = 'tracking_rows' as const;
export const MALL_ORDERS_CHUNK_KIND = 'order_rows' as const;
export const MALL_ORDERS_CONTINUATION_CHUNK_KIND = 'continuation' as const;

/**
 * 캡처를 보관하는 kind(directship·셀피아 송장·몰 주문)의 공통 result. `rowCount`는 오늘 주문 카드가 읽는다
 * (사장님 2026-09-21: 적지 않으면 성공한 수집도 0건으로 남는다). kind별 result는 이를 extend한다.
 */
export const OrdersCaptureResultSchema = z.object({
  rowCount: z.number().int().nonnegative(),
}).passthrough();
export type OrdersCaptureResult = z.infer<typeof OrdersCaptureResultSchema>;
