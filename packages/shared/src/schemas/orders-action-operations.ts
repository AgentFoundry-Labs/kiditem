import { z } from 'zod';
import { resourceLockKey, type OperationLockKey } from './operation.js';
import { SELLPIA_LOGIN_LOCK_KEY } from './sellpia-operations.js';

/**
 * Orders owner의 몰·셀피아 **작업** 실행 kind(ADR-0025, KID-355 wave8b — 옛 확장 워커 액션 7개의 이관). 수집 kind
 * (`orders-operations.ts`)와 달리 대부분 몰이나 셀피아에 **쓴다**. 결과는 실행 `result`에 남고 서버가 진실을 든다 —
 * 옛 액션은 서버에 사실을 하나도 쓰지 않고 웹 화면·브라우저 저장소·확장 세션 저장소에만 남겼다.
 *
 * 사장님 결정(KID-355 2026-09-29 13:31 "추천대로"):
 * - 전송은 실행이 멱등 울타리다(`SellpiaOrderTransmissionIntent`는 wave9 drop). 제출했지만 확인 못 함은 `reconciling`.
 * - 전송 파일은 서버가 원천 실행(`sourceOperationId`)에서 다시 만든다 — scope에 파일이 없다.
 * - 자동송장 대상은 표 없이 실행 result로: 최근 24시간 성공 전송 result의 `acceptedOrderNumbers` − 송장 result의 발급 번호.
 * - 송장 업로드는 kind 하나, 몰 차이는 site 어댑터에.
 *
 * begin으로 연 실행은 `maxAttempts 1`이라 임대가 만료돼도 다시 claim되지 않는다 — 비가역 단계(자동송장·키드키즈 출고확정)의
 * 이중 실행 보호는 계약이 이미 준다. 여기에는 wire에 함께 쓰는 이름·scope·plan·청크·result만 둔다.
 */
export const SELLPIA_ORDER_TRANSFER_KIND = 'orders.sellpia_order_transfer' as const;
export const SELLPIA_POST_TRANSFER_KIND = 'orders.sellpia_post_transfer' as const;
export const SELLPIA_AUTO_INVOICE_KIND = 'orders.sellpia_auto_invoice' as const;
export const SELLPIA_ORDER_SNAPSHOT_KIND = 'orders.sellpia_order_snapshot' as const;
export const COUPANG_SHIPMENT_LIST_KIND = 'orders.coupang_shipment_list' as const;
export const MALL_TRACKING_UPLOAD_KIND = 'orders.mall_tracking_upload' as const;

export const ORDERS_ACTION_OPERATION_KINDS = [
  SELLPIA_ORDER_TRANSFER_KIND,
  SELLPIA_POST_TRANSFER_KIND,
  SELLPIA_AUTO_INVOICE_KIND,
  SELLPIA_ORDER_SNAPSHOT_KIND,
  COUPANG_SHIPMENT_LIST_KIND,
  MALL_TRACKING_UPLOAD_KIND,
] as const;
export type OrdersActionOperationKind = (typeof ORDERS_ACTION_OPERATION_KINDS)[number];

/** 이 kind 6종을 도는 확장 빌드가 `ping` capabilities에 싣는 표시. 웹은 시작 전에 본다(옛 `sellpiaScopedAutoInvoiceV1`·`orderCollectionIcecreamMall` 대체). */
export const ORDERS_ACTION_OPERATION_CAPABILITY = 'orderActionOperationKindsV1' as const;

/** 셀피아에 쓰는 kind도 읽는 kind와 같은 잠금 하나를 나눠 쥔다(조직마다 셀피아 로그인 하나). */
export const SELLPIA_ACTION_LOCK_KEY: OperationLockKey = SELLPIA_LOGIN_LOCK_KEY;
/** 쿠팡 공급사(supplier.coupang.com) 로그인을 쓰는 kind의 잠금. `org` 키는 무관한 kind까지 막아 쓰지 않는다. */
export const COUPANG_SUPPLIER_LOGIN_LOCK_KEY: OperationLockKey = resourceLockKey('coupang-supplier', 'login');

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const orderNumber = z.string().trim().min(1).max(200);

/** 한 파일이 나르는 주문번호 상한(옛 확장 세션 저장소와 같다). */
export const SELLPIA_TRANSFER_TARGETS_MAX = 10_000;
/** 전송에서 받아들여진 주문번호가 자동송장 대상으로 살아 있는 시간(옛 확장 세션 저장소 규칙 그대로, 24시간). */
export const SELLPIA_INVOICE_TARGET_TTL_MS = 24 * 60 * 60 * 1000;

// ─── 1. 셀피아 주문 파일 전송 ────────────────────────────────────────────────────────────────────────

/**
 * 전송: 원천 실행(몰 주문 `orders.mall_orders`·직배송 `orders.coupang_directship`, 수동 업로드 포함)의 변환 파일을 셀피아
 * 주문서수집 화면에 주입하고 [주문접수]를 누른다. owner plan이 파일을 다시 만들어 보관 캡처로 두고 주문번호를 xlsx에서 읽는다.
 */
export const SELLPIA_TRANSFER_TRANSPORTS = ['SHIPMENT', 'MILKRUN'] as const;
export const SellpiaTransferTransportSchema = z.enum(SELLPIA_TRANSFER_TRANSPORTS);
export type SellpiaTransferTransport = z.infer<typeof SellpiaTransferTransportSchema>;

export const SellpiaOrderTransferScopeSchema = z.object({
  sourceOperationId: z.string().uuid(),
  /** 셀피아 판매처 이름(화면의 판매처 선택에 쓴다; 별칭은 site 어댑터가 푼다). */
  shopName: z.string().trim().min(1).max(200),
  /**
   * 직배송 원천(`orders.coupang_directship`)일 때 필수 — 한 실행이 운송유형마다 파일 하나를 낸다(소비 기록·Python 생성기).
   * 몰 주문 원천에는 없어야 한다. owner plan이 원천 kind에 맞춰 검증한다.
   */
  transport: SellpiaTransferTransportSchema.optional(),
  /**
   * 같은 원천(+운송유형)의 성공한 전송이 이미 있으면 서버가 `ORDERS_TRANSFER_ALREADY_SENT`로 거절한다(전송 울타리 = 실행).
   * 운영자가 재전송 확인 창을 거쳐 일부러 다시 보낼 때만 true — plan에 `resendOf`(앞선 성공 실행 id)가 남는다.
   */
  resend: z.boolean().optional(),
}).strict();
export type SellpiaOrderTransferScope = z.infer<typeof SellpiaOrderTransferScopeSchema>;

export const SellpiaOrderTransferPlanSchema = z.object({
  sourceOperationId: z.string().uuid(),
  shopName: z.string().trim().min(1).max(200),
  transport: SellpiaTransferTransportSchema.nullable(),
  /** 재전송이면 앞선 성공 전송 실행 id, 아니면 null. */
  resendOf: z.string().uuid().nullable(),
  fileName: z.string().trim().min(1).max(300),
  /** 서버가 변환 파일에서 읽은 대상 주문번호(판매처주문번호|주문번호|주문코드 머리). 0개면 plan이 거절한다. */
  targetOrderNumbers: z.array(orderNumber).min(1).max(SELLPIA_TRANSFER_TARGETS_MAX),
}).strict();
export type SellpiaOrderTransferPlan = z.infer<typeof SellpiaOrderTransferPlanSchema>;

export const SELLPIA_ORDER_TRANSFER_CHUNK_KIND = 'transfer_evidence' as const;
export const SELLPIA_TRANSFER_OUTCOMES = ['submitted', 'not_submitted', 'unknown'] as const;
export const SellpiaTransferOutcomeSchema = z.enum(SELLPIA_TRANSFER_OUTCOMES);
export type SellpiaTransferOutcome = z.infer<typeof SellpiaTransferOutcomeSchema>;

/**
 * `transfer_evidence` 청크(실행당 하나): 주입·접수 결과. `unknown`이면 확장이 대기목록·재고매칭 두 화면으로 다시 확인한
 * 뒤에도 일부만 찾은 것 — finish는 `reconciling`으로 멈추고 운영자가 셀피아에서 확인해 confirm/close 한다.
 */
export const SellpiaOrderTransferEvidenceSchema = z.object({
  outcome: SellpiaTransferOutcomeSchema,
  /** 셀피아 화면에서 확인된(받아들여진) 대상 주문번호 — 자동송장 대상의 원천. */
  acceptedOrderNumbers: z.array(orderNumber).max(SELLPIA_TRANSFER_TARGETS_MAX),
  baselineRows: z.number().int().min(0),
  afterRows: z.number().int().min(0),
  mallMessage: z.string().max(500).nullable(),
}).strict();
export type SellpiaOrderTransferEvidence = z.infer<typeof SellpiaOrderTransferEvidenceSchema>;

/** 전송 result. `not_submitted`는 성공 finish가 아니라 실패 finish(재전송 허용)라 result의 outcome은 `submitted`뿐이다. */
export const SellpiaOrderTransferResultSchema = z.object({
  outcome: z.literal('submitted'),
  acceptedOrderNumbers: z.array(orderNumber).max(SELLPIA_TRANSFER_TARGETS_MAX),
  targetOrderCount: z.number().int().min(0),
}).strict();
export type SellpiaOrderTransferResult = z.infer<typeof SellpiaOrderTransferResultSchema>;

// ─── 2. 셀피아 후처리(등록 → 자동합포·자동재고매칭) ──────────────────────────────────────────────────────

/** 후처리: 대상 제한 없이 화면 전체(옛 규칙 그대로). scope는 비어 있다. */
export const SellpiaPostTransferScopeSchema = z.object({}).strict();
export type SellpiaPostTransferScope = z.infer<typeof SellpiaPostTransferScopeSchema>;

export const SELLPIA_POST_TRANSFER_CHUNK_KIND = 'post_transfer_steps' as const;
export const SELLPIA_POST_TRANSFER_STEPS = ['register', 'stockmatch'] as const;
export const SellpiaPostTransferStepSchema = z.object({
  step: z.enum(SELLPIA_POST_TRANSFER_STEPS),
  done: z.boolean(),
  mallMessage: z.string().max(500).nullable(),
  /** `stockmatch`에서 매칭되지 않은 행의 주문번호(최대 2,000). */
  unmatchedOrderNumbers: z.array(orderNumber).max(2_000).optional(),
}).strict();
export type SellpiaPostTransferStep = z.infer<typeof SellpiaPostTransferStepSchema>;

/** 후처리 result. `invoiceTargetCount`는 owner finalize가 자동송장 대상 규칙으로 센 값(웹이 confirm 문장에 쓴다). */
export const SellpiaPostTransferResultSchema = z.object({
  registered: z.boolean(),
  stockMatched: z.boolean(),
  unmatchedOrderNumbers: z.array(orderNumber).max(2_000),
  invoiceTargetCount: z.number().int().min(0),
}).strict();
export type SellpiaPostTransferResult = z.infer<typeof SellpiaPostTransferResultSchema>;

// ─── 3. 셀피아 자동송장(비가역) ─────────────────────────────────────────────────────────────────────────

/** 자동송장: 대상은 owner plan이 정한다(최근 24시간 성공 전송 − 이미 발급). scope는 비어 있다. */
export const SellpiaAutoInvoiceScopeSchema = z.object({}).strict();
export type SellpiaAutoInvoiceScope = z.infer<typeof SellpiaAutoInvoiceScopeSchema>;

export const SellpiaAutoInvoicePlanSchema = z.object({
  /** 발급 대상 주문번호. 0개면 plan이 `ORDERS_SELLPIA_INVOICE_NO_TARGETS`로 거절한다. */
  targetOrderNumbers: z.array(orderNumber).min(1).max(SELLPIA_TRANSFER_TARGETS_MAX),
}).strict();
export type SellpiaAutoInvoicePlan = z.infer<typeof SellpiaAutoInvoicePlanSchema>;

export const SELLPIA_AUTO_INVOICE_CHUNK_KIND = 'invoice_rows' as const;
export const SellpiaInvoiceRowSchema = z.object({
  orderNo: orderNumber,
  trackingNumber: z.string().trim().min(1).max(100),
  courier: z.string().max(100),
}).strict();
export type SellpiaInvoiceRow = z.infer<typeof SellpiaInvoiceRowSchema>;

/**
 * 자동송장 result. [송장번호채번]을 눌렀는데 발급 행을 읽지 못하면 finish는 `reconciling`(운영자가 셀피아에서 확인). 대상 중
 * 그리드에 없던 번호는 `notFoundOrderNumbers`로 남기고 발급하지 않는다(대기 행 전체 채번 금지 — 옛 규칙).
 */
export const SellpiaAutoInvoiceResultSchema = z.object({
  issued: z.array(SellpiaInvoiceRowSchema).max(SELLPIA_TRANSFER_TARGETS_MAX),
  selectedOrderNumbers: z.array(orderNumber).max(SELLPIA_TRANSFER_TARGETS_MAX),
  notFoundOrderNumbers: z.array(orderNumber).max(SELLPIA_TRANSFER_TARGETS_MAX),
}).strict();
export type SellpiaAutoInvoiceResult = z.infer<typeof SellpiaAutoInvoiceResultSchema>;

// ─── 4. 셀피아 주문 스냅샷(읽기) ────────────────────────────────────────────────────────────────────────

/** 스냅샷: 대기목록·재고매칭 두 화면의 주문을 읽어 주문번호로 합친다(웹이 브라우저 수집 기록과 대조). */
export const SellpiaOrderSnapshotScopeSchema = z.object({}).strict();
export type SellpiaOrderSnapshotScope = z.infer<typeof SellpiaOrderSnapshotScopeSchema>;

export const SELLPIA_ORDER_SNAPSHOT_CHUNK_KIND = 'snapshot_rows' as const;
export const SELLPIA_SNAPSHOT_SOURCES = ['pending', 'stockmatch'] as const;
export const SellpiaOrderSnapshotRowSchema = z.object({
  orderNo: orderNumber,
  receiver: z.string().max(300),
  provider: z.string().max(300),
  source: z.enum(SELLPIA_SNAPSHOT_SOURCES),
}).strict();
export type SellpiaOrderSnapshotRow = z.infer<typeof SellpiaOrderSnapshotRowSchema>;

export const SELLPIA_SNAPSHOT_ROWS_MAX = 10_000;
/** 스냅샷 result. `partial`은 두 화면 중 하나만 읽은 것(둘 다 못 읽으면 `SITE_LOGIN_REQUIRED` 실패, 탭을 남긴다). */
export const SellpiaOrderSnapshotResultSchema = z.object({
  orderCount: z.number().int().min(0),
  rows: z.array(SellpiaOrderSnapshotRowSchema).max(SELLPIA_SNAPSHOT_ROWS_MAX),
  partial: z.boolean(),
}).strict();
export type SellpiaOrderSnapshotResult = z.infer<typeof SellpiaOrderSnapshotResultSchema>;

// ─── 5. 쿠팡 배송 목록(읽기) ────────────────────────────────────────────────────────────────────────────

/** 배송 목록: 공급사 택배 목록에서 발송일 하나의 쉽먼트 행을 읽는다(웹이 seq·center로 PDF 묶음 entry 액션을 부른다). */
export const CoupangShipmentListScopeSchema = z.object({
  date: isoDay,
}).strict();
export type CoupangShipmentListScope = z.infer<typeof CoupangShipmentListScopeSchema>;

export const COUPANG_SHIPMENT_LIST_MAX_PAGES = 60;
export const CoupangShipmentListPlanSchema = z.object({
  date: isoDay,
  maxPages: z.number().int().min(1).max(COUPANG_SHIPMENT_LIST_MAX_PAGES),
}).strict();
export type CoupangShipmentListPlan = z.infer<typeof CoupangShipmentListPlanSchema>;

export const COUPANG_SHIPMENT_LIST_CHUNK_KIND = 'shipment_rows' as const;
export const CoupangShipmentListRowSchema = z.object({
  seq: z.string().trim().min(1).max(64),
  /** 물류센터 이름 — 파일 이름·정렬에 쓴다(옛 목록 스크립트가 읽던 칸; `parseParcelPage`에 추가). */
  center: z.string().max(200),
  outbound: isoDay.nullable(),
  boxes: z.number().int().min(0),
  status: z.string().max(100).nullable(),
}).strict();
export type CoupangShipmentListRow = z.infer<typeof CoupangShipmentListRowSchema>;

export const COUPANG_SHIPMENT_LIST_ROWS_MAX = 2_000;
export const COUPANG_SHIPMENT_LIST_STOP_REASONS = ['past_date_block', 'empty_pages', 'short_page', 'max_pages'] as const;
/** 배송 목록 result: 그 발송일의 행(seq 중복 제거)과 어디서 멈췄는지. */
export const CoupangShipmentListResultSchema = z.object({
  date: isoDay,
  shipments: z.array(CoupangShipmentListRowSchema).max(COUPANG_SHIPMENT_LIST_ROWS_MAX),
  scannedPages: z.number().int().min(1).max(COUPANG_SHIPMENT_LIST_MAX_PAGES),
  stopReason: z.enum(COUPANG_SHIPMENT_LIST_STOP_REASONS),
}).strict();
export type CoupangShipmentListResult = z.infer<typeof CoupangShipmentListResultSchema>;

// ─── 6. 몰 송장 업로드(몰 쓰기) ─────────────────────────────────────────────────────────────────────────

/** 송장 업로드를 받는 몰. 몰 차이(온채널 행별 POST, 키드키즈 체크박스 + 출고확정 한 번)는 site 어댑터에 있다. */
export const MALL_TRACKING_UPLOAD_MALLS = ['onch', 'kidkids'] as const;
export const MallTrackingUploadMallSchema = z.enum(MALL_TRACKING_UPLOAD_MALLS);
export type MallTrackingUploadMall = z.infer<typeof MallTrackingUploadMallSchema>;

/** 업로드: 셀피아 송장 조회 실행(`orders.sellpia_shipment_tracking`)의 캡처에서 그 몰 행만 owner plan이 고른다. lockKey `account:<channelAccountId>`. */
export const MallTrackingUploadScopeSchema = z.object({
  channelAccountId: z.string().uuid(),
  mallKey: MallTrackingUploadMallSchema,
  trackingOperationId: z.string().uuid(),
}).strict();
export type MallTrackingUploadScope = z.infer<typeof MallTrackingUploadScopeSchema>;

export const MALL_TRACKING_UPLOAD_ROWS_MAX = 2_000;
export const MallTrackingUploadRowSchema = z.object({
  orderNo: orderNumber,
  trackingNumber: z.string().trim().min(1).max(100),
  /** 셀피아 택배사 이름 그대로 — 몰 택배사 코드로의 매핑은 site 어댑터가 한다. */
  courier: z.string().max(100),
}).strict();
export type MallTrackingUploadRow = z.infer<typeof MallTrackingUploadRowSchema>;

export const MallTrackingUploadPlanSchema = z.object({
  channelAccountId: z.string().uuid(),
  mallKey: MallTrackingUploadMallSchema,
  trackingOperationId: z.string().uuid(),
  /** 0개면 plan이 `ORDERS_TRACKING_UPLOAD_NO_ROWS`로 거절한다. */
  rows: z.array(MallTrackingUploadRowSchema).min(1).max(MALL_TRACKING_UPLOAD_ROWS_MAX),
}).strict();
export type MallTrackingUploadPlan = z.infer<typeof MallTrackingUploadPlanSchema>;

export const MALL_TRACKING_UPLOAD_CHUNK_KIND = 'upload_results' as const;
export const MALL_TRACKING_UPLOAD_ROW_STATUSES = ['uploaded', 'already_uploaded', 'not_in_list', 'failed'] as const;
export const MallTrackingUploadRowResultSchema = z.object({
  orderNo: orderNumber,
  status: z.enum(MALL_TRACKING_UPLOAD_ROW_STATUSES),
  mallMessage: z.string().max(500).nullable(),
}).strict();
export type MallTrackingUploadRowResult = z.infer<typeof MallTrackingUploadRowResultSchema>;

/**
 * 업로드 result(행 상태의 합). 키드키즈처럼 몰이 성공 코드를 주지 않아 제출만 확인된 경우 finish는 `reconciling`
 * (운영자가 몰에서 확인해 confirm/close).
 */
export const MallTrackingUploadResultSchema = z.object({
  uploaded: z.number().int().min(0),
  alreadyUploaded: z.number().int().min(0),
  notInList: z.number().int().min(0),
  failed: z.number().int().min(0),
  rows: z.array(MallTrackingUploadRowResultSchema).max(MALL_TRACKING_UPLOAD_ROWS_MAX),
}).strict();
export type MallTrackingUploadResult = z.infer<typeof MallTrackingUploadResultSchema>;
