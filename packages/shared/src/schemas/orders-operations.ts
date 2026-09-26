import { z } from 'zod';
import { ROCKET_PO_ROW_LIMIT, RocketPoCatalogRowSchema, RocketPoSourceBeginSchema } from './rocket-purchase-preview.js';
import { CoupangDirectCenterSchema, CoupangDirectPurchaseOrderSchema, CoupangDirectTransportSchema } from './coupang-direct-order.js';

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

/**
 * 로켓 PO plan: scope + owner가 begin 때 고정한 공급자 기대값(옛 attempt plan에서 sourceType·parserVersion만 뺐다).
 * finalize는 이 기대값과 지금 계정·수집한 공급자 ID를 대조한다.
 */
export const CoupangRocketPoPlanSchema = RocketPoSourceBeginSchema.innerType().extend({
  vendorExpectations: z.object({
    rocketVendorId: z.string().max(120).nullable(),
    sharedCoupangVendorId: z.string().max(120).nullable(),
  }).strict(),
}).strict();
export type CoupangRocketPoPlan = z.infer<typeof CoupangRocketPoPlanSchema>;

/** `po_rows` 청크 항목: 발주서 하나와 그 상세의 SKU 행 전부(목록·상세 합계가 맞은 것만). */
export const CoupangRocketPoChunkItemSchema = z.object({
  poNumber: z.string().min(1).max(80),
  rows: z.array(RocketPoCatalogRowSchema).min(1).max(ROCKET_PO_ROW_LIMIT),
}).strict();
export type CoupangRocketPoChunkItem = z.infer<typeof CoupangRocketPoChunkItemSchema>;

/**
 * `po_scan` 청크 항목(실행당 하나): 목록을 끝까지 읽었다는 증거. 옛 제출의 collection·proof와 같다 —
 * `collectionRunId`는 서버가 실행 ID로 채운다(확장은 실행 ID를 모른다).
 */
export const CoupangRocketPoScanSchema = z.object({
  vendorId: z.string().max(120),
  listPagesRead: z.number().int().min(0).max(100_000),
  totalListPages: z.number().int().min(0).max(100_000),
  detailPoCount: z.number().int().min(0).max(ROCKET_PO_ROW_LIMIT),
  proof: z.object({
    from: isoDay,
    to: isoDay,
    status: z.enum(['RP', 'PA', 'RI', 'CI', '']),
    dateType: z.enum(['WAREHOUSING_PLAN_DATE', 'PURCHASE_ORDER_DATE']),
    validatedList: z.literal(true),
  }).strict(),
}).strict();
export type CoupangRocketPoScan = z.infer<typeof CoupangRocketPoScanSchema>;

/** 로켓 PO 진행: 단계(목록·상세)와 읽은 수 / 전체. */
export const CoupangRocketPoProgressSchema = z.object({
  phase: z.enum(['session', 'list', 'detail', 'done']),
  current: z.number().int().min(0),
  total: z.number().int().min(0),
}).passthrough();
export type CoupangRocketPoProgress = z.infer<typeof CoupangRocketPoProgressSchema>;

/** 로켓 PO result: 발행한 발주서 수와 SKU 행 수. */
export const CoupangRocketPoResultSchema = z.object({
  purchaseOrders: z.number().int().nonnegative(),
  lines: z.number().int().nonnegative(),
}).strict();
export type CoupangRocketPoResult = z.infer<typeof CoupangRocketPoResultSchema>;

/** directship 캡처: 그 계정의 supplier 화면에서 발주·센터를 읽는다. lockKey `account:<channelAccountId>`. */
export const CoupangDirectshipScopeSchema = z.object({
  channelAccountId: z.string().uuid(),
}).strict();
export type CoupangDirectshipScope = z.infer<typeof CoupangDirectshipScopeSchema>;

/** directship plan: 계정과 캡처 방식(브라우저). 운송유형은 가리지 않고 다 읽는다(변환이 유형별로 나눈다). */
export const CoupangDirectshipPlanSchema = z.object({
  channelAccountId: z.string().uuid(),
  captureMode: z.literal('browser'),
}).strict();
export type CoupangDirectshipPlan = z.infer<typeof CoupangDirectshipPlanSchema>;

/**
 * `orders_capture` 청크 항목: 발주확정 발주서 하나(품목 포함) 또는 센터 주소표 하나(실행당 정확히 하나). 옛 캡처
 * (`CoupangDirectOrderCollectionRequest`의 pos·centers)를 1MiB 청크로 나눈 모양이다.
 */
export const CoupangDirectshipCaptureItemSchema = z.union([
  z.object({ purchaseOrder: CoupangDirectPurchaseOrderSchema }).strict(),
  z.object({ centers: z.record(z.string(), CoupangDirectCenterSchema) }).strict(),
]);
export type CoupangDirectshipCaptureItem = z.infer<typeof CoupangDirectshipCaptureItemSchema>;

/** directship 진행: 단계(목록·상세)와 읽은 수 / 전체. */
export const CoupangDirectshipProgressSchema = z.object({
  phase: z.enum(['session', 'list', 'detail', 'done']),
  current: z.number().int().min(0),
  total: z.number().int().min(0),
}).passthrough();
export type CoupangDirectshipProgress = z.infer<typeof CoupangDirectshipProgressSchema>;

/**
 * directship result: 보관한 캡처의 발주서 수(`rowCount` — 오늘 주문 카드가 읽는다), 품목 수, 품목을 못 읽은 발주서 수,
 * 운송유형별 발주서 수. 원장(주문·워크북 대조)은 변환(`POST …/convert`)이 쓴다 — 수집 완료는 하위 계산을 발행하지 않는다.
 */
export const CoupangDirectshipResultSchema = z.object({
  rowCount: z.number().int().nonnegative(),
  purchaseOrders: z.number().int().nonnegative(),
  lines: z.number().int().nonnegative(),
  partialDetailCount: z.number().int().nonnegative(),
  transports: z.object({ SHIPMENT: z.number().int().nonnegative(), MILKRUN: z.number().int().nonnegative() }).strict(),
}).strict();
export type CoupangDirectshipResult = z.infer<typeof CoupangDirectshipResultSchema>;

/**
 * directship 변환 요청(`POST orders/collection/coupang-directship/convert`). 옛 attempt 헤더 대신 성공한 실행 ID를
 * 본문에 싣는다. `pos`·`centers`는 그 실행이 보관한 캡처에서 고른 것(입고예정일 달력 선택)이어야 한다.
 */
export const CoupangDirectshipConvertRequestSchema = z.object({
  operationId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  transport: CoupangDirectTransportSchema,
  pos: z.array(CoupangDirectPurchaseOrderSchema).max(4_000),
  centers: z.record(z.string(), CoupangDirectCenterSchema),
}).strict();
export type CoupangDirectshipConvertRequest = z.infer<typeof CoupangDirectshipConvertRequestSchema>;

/** 셀피아 송장: 주문일 범위. lockKey `org`. */
export const SellpiaShipmentTrackingScopeSchema = z.object({
  startDate: isoDay,
  endDate: isoDay,
}).strict().refine((value) => value.startDate <= value.endDate, '시작일이 끝일보다 늦을 수 없습니다.');
export type SellpiaShipmentTrackingScope = z.infer<typeof SellpiaShipmentTrackingScopeSchema>;

export const MallOrdersCollectionModeSchema = z.enum(['browser', 'manual-upload']);
export const MallOrdersSelectionModeSchema = z.enum(['manual', 'automatic']);
/** 몰 주문 result에 싣는 주문번호 수의 상한. */
export const MALL_ORDERS_ORDER_NUMBERS_MAX = 2_000;
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
 * 몰 주문 kind로 옮긴 몰(1차 넷 KID-359 H3, 2차는 사이트가 다 옮겨진 몰부터 KID-380). 여기 없는 몰은 옛 attempt 경로가 나머지
 * 몰이 옮겨질 때까지 받는다 — 웹은 이 목록으로 시작 경로를 가른다(KID-355 2026-09-26 03:27 리더 설계).
 */
export const MALL_ORDER_OPERATION_MALLS = ['icecream-mall', 'kidkids', 'art09', 'domeggook', 'kidsnote'] as const;
export type MallOrderOperationMall = (typeof MALL_ORDER_OPERATION_MALLS)[number];
export function isMallOrderOperationMall(mallKey: string): mallKey is MallOrderOperationMall {
  return (MALL_ORDER_OPERATION_MALLS as readonly string[]).includes(mallKey);
}

/** 청크 종류(확장 수집기 → owner finalize). */
export const COUPANG_SHIPMENT_SUMMARY_CHUNK_KIND = 'shipment_dates' as const;
export const COUPANG_SHIPMENT_SUMMARY_SCAN_CHUNK_KIND = 'shipment_scan' as const;
export const COUPANG_ROCKET_PO_CHUNK_KIND = 'po_rows' as const;
export const COUPANG_ROCKET_PO_SCAN_CHUNK_KIND = 'po_scan' as const;
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

/**
 * 몰 주문 result(KID-359 H3). `rowCount`는 변환이 말하는 주문 수(`orderCollectionOrderCount`) — 오늘 주문 카드가
 * 읽는다. 주문이 없던 수집도 0으로 적는다. `captured`는 보관한 캡처의 원소 수(주문·행) — 0이면 변환할 것이 없다
 * (주문 수 셈법이 0을 내도 캡처가 있으면 변환 파일은 있다, 예: 택배비 줄이 없는 아트공구 CSV).
 */
export const MallOrdersResultSchema = OrdersCaptureResultSchema.extend({
  mallKey: z.string().min(1).max(64),
  captured: z.number().int().nonnegative(),
  /**
   * 몰이 그 기간의 주문을 빠짐없이 보여 줬다는 확인(확인 범위를 내는 몰 — 도매꾹·해법몰 — 이 수집일로 걷은 성공 실행,
   * 빈 날 포함). 주문 사실 리더가 몰 적용 범위로 읽는다(옛 run의 coverageStartDate/EndDate 자리).
   */
  coverage: z.object({ startDate: isoDay, endDate: isoDay }).strict().optional(),
  /** 화면 표에 개인정보가 가려진 칸이 있었다(아이스크림몰) — 웹이 운영자에게 알린다. */
  masked: z.boolean().optional(),
  /** 이번 수집(고른 행)의 서로 다른 주문번호, 최대 2,000개 — 웹의 생성 파일 항목(일일 건수·중복 판정)이 쓴다. */
  orderNumbers: z.array(z.string().min(1).max(200)).max(MALL_ORDERS_ORDER_NUMBERS_MAX).optional(),
});
export type MallOrdersResult = z.infer<typeof MallOrdersResultSchema>;
