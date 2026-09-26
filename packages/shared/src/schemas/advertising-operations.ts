import { z } from 'zod';
import { resourceLockKey, type OperationLockKey } from './operation.js';

/**
 * Advertising 실행 kind(ADR-0025, KID-362 wave3). owner는 Advertising이다(리더 결정 KID-362 2026-09-26 03:43).
 * 여기에는 wire에 함께 쓰는 이름·scope·청크·결과 모양만 둔다. 두 블록(K-a: K1–K5, K-b: K6·K7)은 서로 건드리지 않는다.
 */

// ── K-b: Wing 일별 사실 계열(트래픽 · 아이템위너) ──────────────────────────────────────

/**
 * Wing 일별 사실(`ChannelListingDailySnapshot` 트래픽·아이템위너 열)을 쓰는 kind는 계정마다 하나씩만 돈다.
 * 옛 advisory `lockListingTraffic`("listing-day 트래픽을 쓰는 쪽은 한 번에 하나")을 대신하는 잠금 키다 — K6·K7이 같은 키를 잡는다.
 */
/**
 * 확장 수집기가 로그인한 Wing 세션의 판매자 식별자(업체코드)가 plan 계정 것과 다를 때 내는 런타임 코드(KID-362 M1).
 * 서버 finalize도 청크 표식의 식별자로 같은 대조를 한다(`vendor_identity_mismatch`).
 */
export const WING_VENDOR_IDENTITY_MISMATCH = 'WING_VENDOR_IDENTITY_MISMATCH' as const;

export function wingDailyLockKey(channelAccountId: string): OperationLockKey {
  return resourceLockKey('wing-daily', channelAccountId);
}

// K7 — Wing 아이템위너(`seller-price-management/getProductList`, 읽기 전용)

export const WING_ITEMWINNER_KIND = 'advertising.wing_itemwinner' as const;

/** 시작은 계정만 고른다. 페이지·업무일은 owner plan이 정한다. */
export const WingItemwinnerScopeSchema = z.object({
  channelAccountId: z.string().uuid(),
}).strict();
export type WingItemwinnerScope = z.infer<typeof WingItemwinnerScopeSchema>;

/** 한 번에 읽는 상한(옛 `ITEMWINNER_MAX_ITEMS`). 넘으면 잘린 목록을 완결로 보지 않고 실패한다. */
export const WING_ITEMWINNER_MAX_ITEMS = 1_000;

/** 행 청크(확장 → owner finalize). */
export const WING_ITEMWINNER_CHUNK_KIND = 'itemwinner_rows' as const;
/** 응답 하나의 표식 {totalSize, observedAt}. finalize가 행 수와 대조해 완결을 판정한다. */
export const WING_ITEMWINNER_PAGE_CHUNK_KIND = 'itemwinner_page' as const;

/** Wing 아이템위너 한 행(옛 `normalizeItemwinnerRow`). `isWinner`는 노출제한이 아닌 위너만 true. */
export const WingItemwinnerRowSchema = z.object({
  vendorItemId: z.string().regex(/^\d+$/),
  productName: z.string().min(1).max(80),
  isWinner: z.boolean(),
  myPrice: z.number().int(),
  winnerPrice: z.number().int(),
  salesQty: z.number().int().nonnegative(),
  suppressed: z.boolean(),
  providerWinnerStatus: z.boolean(),
}).strict();
export type WingItemwinnerRow = z.infer<typeof WingItemwinnerRowSchema>;

/** Wing 판매자 식별자(업체코드). 확장이 읽은 Wing 세션의 것 — owner가 plan의 계정 것과 대조한다. */
const vendorId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);

/** owner plan(확장 수집기가 받는 것). `vendorId`는 계정의 Wing 판매자 식별자다. */
export const WingItemwinnerPlanSchema = z.object({
  channelAccountId: z.string().uuid(),
  vendorId,
  businessDate: z.string().date(),
}).strict();
export type WingItemwinnerPlan = z.infer<typeof WingItemwinnerPlanSchema>;

export const WingItemwinnerPageSchema = z.object({
  totalSize: z.number().int().min(0).max(WING_ITEMWINNER_MAX_ITEMS),
  observedAt: z.string().datetime({ offset: true }),
  /** 확장이 이 목록을 읽은 Wing 세션의 판매자 식별자. */
  vendorId,
}).strict();
export type WingItemwinnerPage = z.infer<typeof WingItemwinnerPageSchema>;

/** 한 listing이 이 실행에서 관측된 위너 상태(상태 카드가 읽는다 — 매일 바뀌는 일별 행을 다시 읽지 않는다). */
export const WingItemwinnerListingObservationSchema = z.object({
  listingId: z.string().uuid(),
  isOfferWinner: z.boolean().nullable(),
  lastObservedAt: z.string().datetime({ offset: true }),
}).strict();
export type WingItemwinnerListingObservation = z.infer<typeof WingItemwinnerListingObservationSchema>;

/** owner가 행에서 센 KPI(옛 확장 `itemwinnerKpis`의 세 칸). */
export const WingItemwinnerKpisSchema = z.object({
  winners: z.number().int().nonnegative(),
  suppressed: z.number().int().nonnegative(),
  losers: z.number().int().nonnegative(),
}).strict();
export type WingItemwinnerKpis = z.infer<typeof WingItemwinnerKpisSchema>;

export const WingItemwinnerResultSchema = z.object({
  channelAccountId: z.string().uuid(),
  businessDate: z.string().date(),
  observedAt: z.string().datetime({ offset: true }),
  rowCount: z.number().int().nonnegative(),
  matchedCount: z.number().int().nonnegative(),
  unmatchedCount: z.number().int().nonnegative(),
  kpis: WingItemwinnerKpisSchema,
  listingObservations: z.array(WingItemwinnerListingObservationSchema),
}).strict();
export type WingItemwinnerResult = z.infer<typeof WingItemwinnerResultSchema>;

// K6 — Wing 일별 트래픽(`rfm-ss/api/business-insight`, 읽기 전용)

export const WING_TRAFFIC_KIND = 'advertising.wing_traffic' as const;

/** 한 번에 시작할 수 있는 가장 긴 범위(일). */
export const WING_TRAFFIC_MAX_COLLECTION_DAYS = 92;
/** 하루에 읽는 상세 쪽 상한(옛 `MAX_PAGES`, 100개씩). 넘으면 잘린 날을 완결로 보지 않는다. */
export const WING_TRAFFIC_MAX_PAGES_PER_DAY = 100;

const calendarDate = z.string().date();
const metric = z.number().finite().int().safe();
const providerRatio = z.number().finite().nullable();

/** 시작: 계정과 (선택) 마감된 KST 날짜 범위. 비우면 plan이 어제까지 7일(옛 기본 범위)을 정한다. */
export const WingTrafficScopeSchema = z.object({
  channelAccountId: z.string().uuid(),
  startDate: calendarDate.optional(),
  endDate: calendarDate.optional(),
}).strict().refine((scope) => !scope.startDate || !scope.endDate || scope.startDate <= scope.endDate, {
  message: '시작일이 종료일보다 늦습니다',
  path: ['endDate'],
});
export type WingTrafficScope = z.infer<typeof WingTrafficScopeSchema>;

/** owner plan(확장 수집기가 받는 것). `vendorId`는 Wing 행의 판매자 식별자와 대조한다. */
export const WingTrafficPlanSchema = z.object({
  channelAccountId: z.string().uuid(),
  vendorId: z.string().min(1),
  startDate: calendarDate,
  endDate: calendarDate,
  expectedDates: z.array(calendarDate).min(1).max(366),
  maxPagesPerDay: z.number().int().min(1).max(WING_TRAFFIC_MAX_PAGES_PER_DAY),
  /** 실행이 시작된 시각. 그 뒤 카탈로그에 들어온 리스팅은 빠진 날을 0으로 채우지 않는다(owner가 쓴다). */
  startedAt: z.string().datetime({ offset: true }),
}).strict();
export type WingTrafficPlan = z.infer<typeof WingTrafficPlanSchema>;

/** 옵션(vendorItem)-일 행 청크. listing 맞춤은 owner finalize가 그때의 카탈로그로 한다. */
export const WING_TRAFFIC_ROWS_CHUNK_KIND = 'traffic_rows' as const;
/** 하루를 다 읽은 표식 {businessDate, pages, rows, explicitEmpty, capturedAt, accountSummary}. */
export const WING_TRAFFIC_DAY_CHUNK_KIND = 'traffic_days' as const;
/** 확정 창 전체의 계정 요약(대조용) 하나. 이 창이 실행이 확정한 날짜다. */
export const WING_TRAFFIC_PERIOD_CHUNK_KIND = 'traffic_period' as const;

export const WingTrafficRowSchema = z.object({
  businessDate: calendarDate,
  vendorItemId: z.string().regex(/^[1-9]\d*$/),
  /** Wing 등록상품 id(inventoryId). 옵션이 맞지 않을 때 listing으로 맞추는 근거. */
  productId: z.string().regex(/^[1-9]\d*$/).nullable(),
  visitors: metric,
  views: metric,
  cartAdds: metric,
  orders: metric,
  salesQty: metric,
  revenue: metric,
}).strict();
export type WingTrafficRow = z.infer<typeof WingTrafficRowSchema>;

export const AdTrafficAccountSummarySchema = z.object({
  visitors: metric,
  views: metric,
  cartAdds: metric,
  orders: metric,
  salesQty: metric,
  revenue: metric,
  providerConversionRate: providerRatio,
}).strict();
export type AdTrafficAccountSummary = z.infer<typeof AdTrafficAccountSummarySchema>;

export const WingTrafficDaySchema = z.object({
  businessDate: calendarDate,
  pages: z.number().int().min(1).max(WING_TRAFFIC_MAX_PAGES_PER_DAY),
  rows: z.number().int().nonnegative(),
  /** Wing이 그날 결과 0개라고 답했다(0행이 수집 실패가 아니라는 증거). */
  explicitEmpty: z.boolean(),
  capturedAt: z.string().datetime({ offset: true }),
  accountSummary: AdTrafficAccountSummarySchema,
}).strict();
export type WingTrafficDay = z.infer<typeof WingTrafficDaySchema>;

export const WingTrafficPeriodSchema = z.object({
  startDate: calendarDate,
  endDate: calendarDate,
  capturedAt: z.string().datetime({ offset: true }),
  /** 확장이 이 창을 읽은 Wing 세션의 판매자 식별자. 빈 날만 있는 창도 이것으로 계정을 확인한다. */
  vendorId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),
  accountSummary: AdTrafficAccountSummarySchema,
}).strict();
export type WingTrafficPeriod = z.infer<typeof WingTrafficPeriodSchema>;

/** 확정된 하루의 계정 요약(Wing `vendor-summary`, 그날 하루). */
export const AdTrafficSourceAccountDailySchema = z.object({
  businessDate: calendarDate,
  observedAt: z.string().datetime({ offset: true }),
  operationId: z.string().uuid(),
  providerConversionRate: providerRatio,
  visitors: metric,
  views: metric,
  cartAdds: metric,
  orders: metric,
  salesQty: metric,
  revenue: metric,
}).strict();
export type AdTrafficSourceAccountDaily = z.infer<typeof AdTrafficSourceAccountDailySchema>;

export const WingTrafficPeriodSummarySchema = z.object({
  startDate: calendarDate,
  endDate: calendarDate,
  observedAt: z.string().datetime({ offset: true }),
  operationId: z.string().uuid(),
  accountSummary: AdTrafficAccountSummarySchema,
}).strict();
export type WingTrafficPeriodSummary = z.infer<typeof WingTrafficPeriodSummarySchema>;

/** finish 결과. 확정 날짜·계정 일별 요약·기간 요약은 원장 읽기(`AD_TRAFFIC_READ_PORT`)와 커버리지의 근거다. */
export const WingTrafficResultSchema = z.object({
  channelAccountId: z.string().uuid(),
  requestedStartDate: calendarDate,
  requestedEndDate: calendarDate,
  /** 이 실행이 확정한 날짜(plan 순서). 쿠팡이 아직 공개하지 않은 뒷날은 빠진다. */
  confirmedDates: z.array(calendarDate).min(1),
  /** Wing이 0개라고 답한 확정 날짜. */
  providerBackedEmptyDates: z.array(calendarDate),
  accountDaily: z.array(AdTrafficSourceAccountDailySchema),
  periodSummary: WingTrafficPeriodSummarySchema,
  rowCount: z.number().int().nonnegative(),
  matchedCount: z.number().int().nonnegative(),
  unmatchedCount: z.number().int().nonnegative(),
  /**
   * 날짜마다 카탈로그에 맞지 않은 Wing 옵션 id(KID-217). 그 뒤 카탈로그에 그 옵션이 들어오면(늦게 커밋된 가져오기·
   * 다시 활성화) 그 계정의 그 날짜는 행이 합계에서 빠진 날이므로 수집 안 된 날로 친다.
   */
  unmatchedOptionIdsByDate: z.record(calendarDate, z.array(z.string())),
}).strict();
export type WingTrafficResult = z.infer<typeof WingTrafficResultSchema>;

/** 진행(화면·임대용). */
export const WingTrafficProgressSchema = z.object({
  current: calendarDate.nullable(),
  confirmedDays: z.number().int().nonnegative(),
  plannedDays: z.number().int().nonnegative(),
  rows: z.number().int().nonnegative(),
}).strict();
export type WingTrafficProgress = z.infer<typeof WingTrafficProgressSchema>;

// 원장 읽기(`AD_TRAFFIC_READ_PORT` — Analytics·Finance가 읽는다)

const reconciliationMetricSchema = z.object({
  dailySum: metric.nullable(),
  periodValue: metric.nullable(),
}).strict();

export const AdTrafficSourceReconciliationSchema = z.object({
  views: reconciliationMetricSchema,
  cartAdds: reconciliationMetricSchema,
  orders: reconciliationMetricSchema,
  salesQty: reconciliationMetricSchema,
  revenue: reconciliationMetricSchema,
}).strict();
export type AdTrafficSourceReconciliation = z.infer<typeof AdTrafficSourceReconciliationSchema>;

export type AdTrafficReconciliationStatus = 'MATCHED' | 'MISMATCH' | 'UNVERIFIED';

/** 일별 합과 쿠팡 기간 값의 대조 단어 하나. 한쪽이라도 미측정이면 미검증. */
export function adTrafficReconciliationStatus(metric: {
  dailySum: number | null;
  periodValue: number | null;
}): AdTrafficReconciliationStatus {
  if (metric.dailySum === null || metric.periodValue === null) return 'UNVERIFIED';
  return metric.dailySum === metric.periodValue ? 'MATCHED' : 'MISMATCH';
}

export const AdTrafficSourceCoverageSchema = z.object({
  from: calendarDate,
  to: calendarDate,
  targetDays: z.number().int().nonnegative(),
  completedDays: z.number().int().nonnegative(),
  missingDates: z.array(calendarDate),
}).strict();
export type AdTrafficSourceCoverage = z.infer<typeof AdTrafficSourceCoverageSchema>;

/** 한 계정의 Wing 트래픽 원장: 날짜마다 가장 최근 성공 실행의 계정 요약. */
export const AdTrafficSourcePublishedSchema = z.object({
  channelAccountId: z.string().uuid(),
  accountDaily: z.array(AdTrafficSourceAccountDailySchema),
  periodSummary: WingTrafficPeriodSummarySchema.nullable(),
  coverage: AdTrafficSourceCoverageSchema,
  reconciliation: AdTrafficSourceReconciliationSchema,
}).strict();
export type AdTrafficSourcePublished = z.infer<typeof AdTrafficSourcePublishedSchema>;
export const AdTrafficSourceDailyPublishedSchema = AdTrafficSourcePublishedSchema;
export type AdTrafficSourceDailyPublished = AdTrafficSourcePublished;

/**
 * 채널 일별 행의 트래픽 값을 누가 썼는가. Wing이 유일한 listing-day 트래픽 발행자다(CSV 업로드 경로는 KID-110에서
 * 은퇴). 행이 측정인지는 행의 `trafficObservedAt`이 말한다.
 */
export type DailyTrafficFactSource = 'wing';

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function dailyTrafficFactSource(metaJson: unknown): DailyTrafficFactSource | null {
  const root = jsonRecord(metaJson);
  if (!root) return null;
  const marker = root['traffic.currentSource'];
  if (marker !== undefined) return marker === 'wing.traffic' ? 'wing' : null;
  // 표식 이전에 쓴 행은 Wing 이름공간을 갖는다.
  return jsonRecord(root['wing.traffic']) !== null || root.source === 'wing.traffic' ? 'wing' : null;
}
