import { z } from 'zod';
import { resourceLockKey, type OperationLockKey } from './operation.js';

/**
 * 셀피아(kiditem.sellpia.com)에서 읽는 실행 kind(ADR-0025, KID-361·363 wave3). owner는 kind 접두가 말한다 —
 * Products(재고)·Analytics(매출·상품 손익)·Channels(수동매칭). 여기에는 wire에 함께 쓰는 이름·scope·잠금 키만 둔다.
 * 리더 결정(KID-361 2026-09-26 03:43): 셀피아 로그인을 쓰는 kind는 모두 같은 잠금 키 하나로 서로 막는다 —
 * 조직마다 셀피아 로그인이 하나이고(Wing "같은 로그인은 하나만"과 같은 규칙), `org` 키는 무관한 kind까지 막는다.
 */
export const SELLPIA_LOGIN_LOCK_KEY: OperationLockKey = resourceLockKey('sellpia', 'login');

export const SELLPIA_INVENTORY_KIND = 'products.sellpia_inventory' as const;
export const SELLPIA_SALES_KIND = 'analytics.sellpia_sales' as const;
export const SELLPIA_PRODUCT_PROFITABILITY_KIND = 'analytics.sellpia_product_profitability' as const;
export const SELLPIA_MANUAL_MATCH_KIND = 'channels.sellpia_manual_match' as const;

export const SELLPIA_OPERATION_KINDS = [
  SELLPIA_INVENTORY_KIND,
  SELLPIA_SALES_KIND,
  SELLPIA_PRODUCT_PROFITABILITY_KIND,
  SELLPIA_MANUAL_MATCH_KIND,
] as const;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

/**
 * 재고: 셀피아 상품 목록 전체(옛 `scope: 'inventory'`). 옛 `'full'`(손익 동시 수집)은 웹이 보낸 적 없고 owner·수집기에
 * 분기도 없어 없앤다(리더 결정, KID-361 03:43). 시작 계기는 plan에 `trigger`로 남긴다.
 */
export const SellpiaInventoryScopeSchema = z.object({
  trigger: z.string().trim().min(1).max(64).optional(),
}).strict();
export type SellpiaInventoryScope = z.infer<typeof SellpiaInventoryScopeSchema>;

/** 매출: 주문일 범위. 비우면 owner plan이 옛 기본 범위(`buildSellpiaSalesSourcePlan`)를 정한다. */
export const SellpiaSalesScopeSchema = z.object({
  startDate: isoDay.optional(),
  endDate: isoDay.optional(),
}).strict().refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, '시작일이 종료일보다 늦습니다');
export type SellpiaSalesScope = z.infer<typeof SellpiaSalesScopeSchema>;

/** 상품 손익: 옛 begin 입력 그대로(정규화 원천 가용일, 없으면 plan이 어제까지 401일 창). */
export const SellpiaProductProfitabilityScopeSchema = z.object({
  normalizedSourceAvailabilityDate: isoDay.optional(),
}).strict();
export type SellpiaProductProfitabilityScope = z.infer<typeof SellpiaProductProfitabilityScopeSchema>;

/** 수동매칭: 대상은 owner plan이 정한다(옛 `targets` 조회와 같은 규칙) — scope는 비어 있다. */
export const SellpiaManualMatchScopeSchema = z.object({}).strict();
export type SellpiaManualMatchScope = z.infer<typeof SellpiaManualMatchScopeSchema>;

/** 청크 종류(확장 수집기 → owner finalize). */
export const SELLPIA_INVENTORY_CHUNK_KIND = 'inventory_rows' as const;
export const SELLPIA_SALES_CHUNK_KIND = 'sales_rows' as const;
export const SELLPIA_PROFIT_CHUNK_KIND = 'profit_months' as const;
export const SELLPIA_MANUAL_MATCH_CHUNK_KIND = 'match_results' as const;

/** 재고 한 번에 읽는 상품 줄 상한(옛 수집기 MAX_ROWS와 같다). */
export const SELLPIA_INVENTORY_MAX_ROWS = 20_000;

/**
 * 재고 청크의 머리 항목 — 첫 `inventory_rows` 청크의 첫 항목이다. 나머지 항목은 상품 줄(옛 JSON 스냅샷
 * `sellpia-inventory-snapshot-v1.json`의 `rows[]`와 같은 모양, `SellpiaInventoryBrowserSnapshotRowSchema`)이다.
 * `rowCount`로 owner가 청크가 빠지지 않았는지 본다. 셀피아가 빈 목록을 주면 수집기가 실패로 끝낸다(옛 규칙).
 */
export const SellpiaInventoryChunkHeaderSchema = z.object({
  source: z.literal('sellpia_product_search'),
  version: z.literal(1),
  rowCount: z.number().int().min(1).max(SELLPIA_INVENTORY_MAX_ROWS),
}).strict();
export type SellpiaInventoryChunkHeader = z.infer<typeof SellpiaInventoryChunkHeaderSchema>;

/** 재고 finish 결과: 받은 줄 수와 발행 뒤 셀피아 원천 상품 수. */
export const SellpiaInventoryResultSchema = z.object({
  rows: z.number().int().nonnegative(),
  products: z.number().int().nonnegative(),
}).strict();
export type SellpiaInventoryResult = z.infer<typeof SellpiaInventoryResultSchema>;

/**
 * 매출 청크 한 항목 = 판매처 하나의 하루(옛 판매현황 수집 `sellers[].days[]`를 판매처·일자로 편 모양). 금액·수량은
 * 셀피아가 준 그대로(음수·소수 포함)이고, owner가 원장에 넣을 때 0 이상의 정수로 자른다. `sellerName`은 셀피아
 * 판매처 이름표(`provider_list_all`)에서 온다.
 */
export const SellpiaSalesRowSchema = z.object({
  sellerId: z.string().trim().min(1).max(64),
  sellerName: z.string().trim().min(1).max(200),
  date: isoDay,
  price: z.number().finite(),
  amount: z.number().finite(),
  buyPrice: z.number().finite(),
}).strict();
export type SellpiaSalesRow = z.infer<typeof SellpiaSalesRowSchema>;

/** 매출 finish 결과: 바꿔 쓴 업무일 수와 넣은 판매처·일 줄 수. */
export const SellpiaSalesResultSchema = z.object({
  days: z.number().int().nonnegative(),
  rows: z.number().int().nonnegative(),
}).strict();
export type SellpiaSalesResult = z.infer<typeof SellpiaSalesResultSchema>;

const nonNegativeInt4 = z.number().int().min(0).max(2_147_483_647);

/** 상품 손익 한 달(판매 그래프의 판매 값 + 그 달 구매기간의 매입 합계, 옛 `products[].months[]`). */
export const SellpiaProfitMonthSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM'),
  orderQty: nonNegativeInt4,
  orderAmount: nonNegativeInt4,
  inQty: nonNegativeInt4,
  inAmount: nonNegativeInt4,
}).strict();

/**
 * 상품 손익 청크(`profit_months`) 한 항목 = 상품·옵션 하나와 그 월별 사실(옛 v2 제출 `products[]` 한 줄 그대로). 월 합이
 * 셀피아 상단 합계(`total*`)와 맞는지는 owner가 다시 본다 — 한 상품의 달들이 한 항목에 있어야 그 대조가 된다.
 */
export const SellpiaProfitProductSchema = z.object({
  productCode: z.string().trim().min(1).max(64),
  optionCode: z.string().max(64),
  productName: z.string().trim().min(1).max(400),
  optionName: z.string().max(400).optional(),
  providerName: z.string().max(200).optional(),
  salePrice: nonNegativeInt4,
  buyPrice: nonNegativeInt4,
  barcode: z.string().max(64).optional(),
  totalOrderAmount: nonNegativeInt4,
  totalOrderQty: nonNegativeInt4,
  totalInAmount: nonNegativeInt4,
  totalInQty: nonNegativeInt4,
  months: z.array(SellpiaProfitMonthSchema).max(24),
}).strict();
export type SellpiaProfitProduct = z.infer<typeof SellpiaProfitProductSchema>;

/**
 * 상품 손익 finish 결과: 덮은 달 수·넣은 월 사실 줄 수와, ABC 근거가 세대를 검증하는 품질 값(매핑된/안 된 줄, 받은 본문
 * 체크섬·바이트). 매핑 세대·원가 출처는 plan이 말한다.
 */
export const SellpiaProductProfitabilityResultSchema = z.object({
  months: z.number().int().nonnegative(),
  rows: z.number().int().nonnegative(),
  quality: z.object({
    mappedRows: z.number().int().nonnegative(),
    unmappedRows: z.number().int().nonnegative(),
    contentChecksum: z.string().regex(/^[a-f0-9]{64}$/),
    contentByteCount: z.number().int().positive(),
  }).strict(),
}).strict();
export type SellpiaProductProfitabilityResult = z.infer<typeof SellpiaProductProfitabilityResultSchema>;
