import { z } from 'zod';
import { AlertStatusSchema } from './alerts.js';
import { zIsoDate } from './common.js';
import { parseBusinessDate } from '../common.js';
import {
  ProductAbcEvaluationSchema,
  ProductAbcFormulaPayloadSchema,
  ProductAbcGradeSchema,
  ProductAbcReadModelSchema,
} from './product-abc.js';

// ─── Shared building blocks ───────────────────────────────────────────────

/**
 * A strict KST calendar date used by dashboard evidence. `zIsoDate` is
 * intentionally looser because it also accepts Prisma Date values; source
 * coverage needs an exact, comparable date key instead.
 */
export const DashboardCalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((value) => parseBusinessDate(value) !== null, 'Expected a valid calendar date');

export const DashboardPeriodBasisStatusSchema = z.enum([
  'complete',
  'partial',
  'empty',
  'unverified',
]);

export const DashboardSnapshotBasisStatusSchema = z.enum([
  'current',
  'stale',
  'unavailable',
  'unknown',
]);

/**
 * Evidence basis for one period metric: what was asked for and what was
 * measured. `from`/`to` and `targetDays` are the request; `includedDates`
 * are the dates that carry a measurement, collected zeroes included;
 * `invalidDates` were read and rejected and are never treated as collected
 * zeroes; `queryFailedSources` says a required read threw.
 *
 * Nothing derived travels on the wire. The status word, the missing dates and
 * the day count are functions of these fields, and `schemas/dashboard-basis.ts`
 * holds those functions for every reader, server and web alike. Sorted unique
 * date arrays inside the range are guaranteed by `buildPeriodBasis`, the one
 * constructor the server authors these payloads with; this is a
 * server-authored response schema, so it validates shape only.
 */
export const DashboardPeriodBasisSchema = z.object({
  kind: z.literal('period'),
  from: DashboardCalendarDateSchema,
  to: DashboardCalendarDateSchema,
  targetDays: z.number().int().nonnegative(),
  includedDates: z.array(DashboardCalendarDateSchema),
  invalidDates: z.array(DashboardCalendarDateSchema),
  sources: z.array(z.string().trim().min(1)).min(1),
  /** Sources whose required read failed; distinct from an empty result. */
  queryFailedSources: z.array(z.string().trim().min(1)).optional(),
}).strict();

/**
 * Evidence basis for one stored-owner-result value: whether an owner result
 * was measured at all, the as-of it actually reached, the as-of the reader
 * needed, and how many members of the population were left out.
 *
 * The age word (current / stale / unknown / unavailable) and whether the count
 * is partial are functions of these fields; `schemas/dashboard-basis.ts` holds
 * them for every reader. Normalised by `buildSnapshotBasis`, the one
 * constructor the server authors these payloads with.
 */
export const DashboardSnapshotBasisSchema = z.object({
  kind: z.literal('snapshot'),
  /** Whether any owner result backs the value. A counted zero is measured. */
  measured: z.boolean(),
  /** The as-of the owner result actually reached; `null` when unmeasured or unknown. */
  asOf: DashboardCalendarDateSchema.nullable(),
  /** The as-of the reader needed; `null` when it had no requirement. */
  requiredAsOf: DashboardCalendarDateSchema.nullable(),
  observedAt: zIsoDate.nullable(),
  sources: z.array(z.string().trim().min(1)).min(1),
  /** Population members left out because they could not be measured. */
  withheldCount: z.number().int().nonnegative(),
}).strict();

// Both bases are plain strict objects now that their cross-field invariants
// are guaranteed by their constructor, so `kind` can discriminate and a
// malformed basis reports the one branch's real error.
export const DashboardMetricBasisSchema = z.discriminatedUnion('kind', [
  DashboardPeriodBasisSchema,
  DashboardSnapshotBasisSchema,
]);

/** Stable dotted paths such as `monthly.profit` or `warnings.highAdProducts`. */
export const DashboardMetricBasisMapSchema = z.record(
  z.string().trim().min(1),
  DashboardMetricBasisSchema,
);

export type DashboardCalendarDate = z.infer<typeof DashboardCalendarDateSchema>;
export type DashboardPeriodBasis = z.infer<typeof DashboardPeriodBasisSchema>;
export type DashboardSnapshotBasis = z.infer<typeof DashboardSnapshotBasisSchema>;
export type DashboardMetricBasis = z.infer<typeof DashboardMetricBasisSchema>;
export type DashboardMetricBasisMap = z.infer<typeof DashboardMetricBasisMapSchema>;

/** Actual numeric inputs used by a computed dashboard profit value. */
export const DashboardProfitInputsSchema = z.object({
  revenue: z.number().finite(),
  cost: z.number().finite(),
  adCost: z.number().finite(),
  qty: z.number().finite().nullable(),
  basis: DashboardPeriodBasisSchema,
}).strict();

// schemas/dashboard.ts: DashboardAlertItemSchema — dashboard card projection
// (nullable+optional targetType/targetId; server may omit them when a card row has no polymorphic target).
// NOTE: alerts.ts defines AlertItemSchema with a required organizationId field (full DB row).
// Dashboard alerts are a projected subset (no organizationId), defined separately rather than reusing/importing.
// (Plan B2c.dashboard T9, BREAKING — was `productId`; DB schema has `targetType + targetId`)
export const DashboardAlertItemSchema = z.object({
  id: z.string(),
  status: AlertStatusSchema,
  type: z.string(),
  title: z.string(),
  message: z.string().nullable(),
  sourceType: z.string().nullable().optional(),
  href: z.string().nullable().optional(),
  targetType: z.string().nullable().optional(),
  targetId: z.string().nullable().optional(),
  isRead: z.boolean(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate.optional(),
});

export const TopProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  organization: z.string(),
  grade: ProductAbcGradeSchema.nullable(),
  abcEvaluation: ProductAbcEvaluationSchema.nullable(),
  revenue: z.number(),
  /**
   * Null when this row's profit was not measured, which is the same rule
   * `ProfitBreakdownSchema` follows: a Rocket purchase-order line carries no
   * listing to settle against, and a listing whose ad coverage is incomplete is
   * withheld by `buildPerListingProfit`. Revenue is always measured; profit is
   * not, and a margin assumption standing in for it was indistinguishable from
   * a measurement on screen.
   */
  netProfit: z.number().nullable(),
  profitRate: z.number().nullable(),
});

export const MonthlyTrendItemSchema = z.object({
  period: z.string(),
  // A month with no complete order/Wing/ads evidence is unavailable, not a
  // measured zero. Consumers can distinguish an explicit collected zero.
  revenue: z.number().nullable(),
  profit: z.number().nullable(),
  adCost: z.number().nullable(),
  metricBasis: DashboardMetricBasisMapSchema.optional(),
});

export const ProfitBreakdownSchema = z.object({
  revenue: z.number().nullable(),
  costOfGoods: z.number().nullable(),
  commission: z.number().nullable(),
  shippingCost: z.number().nullable(),
  adCost: z.number().nullable(),
  otherCost: z.number().nullable(),
  /** Null when a cost input is unavailable; never a measured zero. */
  netProfit: z.number().nullable(),
  orderCount: z.number().nullable(),
  metricBasis: DashboardMetricBasisMapSchema.optional(),
});

export const TrafficCoverageSchema = z.object({
  from: z.string(),
  to: z.string(),
  targetDays: z.number().int().nonnegative(),
  completedDays: z.number().int().nonnegative(),
  missingDates: z.array(z.string()),
}).strict();

/** The reconciliation word derives from these two totals (`adTrafficReconciliationStatus`). */
export const TrafficMetricReconciliationSchema = z.object({
  dailySum: z.number().nullable(),
  periodValue: z.number().nullable(),
}).strict();

export const TrafficReconciliationSchema = z.object({
  views: TrafficMetricReconciliationSchema,
  cartAdds: TrafficMetricReconciliationSchema,
  orders: TrafficMetricReconciliationSchema,
  salesQty: TrafficMetricReconciliationSchema,
  revenue: TrafficMetricReconciliationSchema,
}).strict();

export const TrafficKpiSchema = z.object({
  // A nullable value means unavailable (missing coverage or restricted by
  // reconciliation). Zero remains a valid collected value.
  visitors: z.number().nullable(),
  views: z.number().nullable(),
  orders: z.number().nullable(),
  salesQty: z.number().nullable(),
  revenue: z.number().nullable(),
  cartAdds: z.number().nullable(),
  /** Cart additions / views on the traffic owner's measured population. */
  cartRate: z.number().nullable().optional(),
  date: z.string().optional(),
  periodDays: z.number().optional(),
  productCount: z.number().optional(),
  /** Our orders / views ratio; providerConversionRate is kept separately. */
  conversionRate: z.number().nullable(),
  /** Orders / cart additions on the exact Orders × traffic population. */
  orderCartRate: z.number().nullable().optional(),
  dailyAverageVisitors: z.number().nullable(),
  providerConversionRate: z.number().nullable(),
  coverage: TrafficCoverageSchema.nullable(),
  reconciliation: TrafficReconciliationSchema.nullable(),
  exactPeriodEvidence: z.record(z.any()).nullable(),
  source: z.string().optional(),
  netProfit: z.number().nullable().optional(),
  profitRate: z.number().nullable().optional(),
  costCoverage: z.number().optional(),
  needsScrape: z.boolean().optional(),
  trafficAvailable: z.boolean().optional(),
  trafficObservedAt: zIsoDate.nullable().optional(),
  metricBasis: DashboardMetricBasisMapSchema.optional(),
});

export const PlanAchievementSchema = z.object({
  targetRevenue: z.number(),
  actualRevenue: z.number(),
  targetOrders: z.number(),
  actualOrders: z.number(),
  achieveRate: z.number(),
});

export const GradeChangesSchema = z.object({
  upgraded: z.number(),
  downgraded: z.number(),
  total: z.number(),
});

export const WarningsSchema = z.object({
  minusProducts: z.number(),
  lowProfitProducts: z.number(),
  highAdProducts: z.number(),
  outOfStockSkus: z.number().nullable(),
  mappingAttentionSkus: z.number(),
  lowCtrProducts: z.number().optional(),
  lowReviewProducts: z.number().optional(),
  metricBasis: DashboardMetricBasisMapSchema.optional(),
});

export const DailyRevenueItemSchema = z.object({
  date: z.string(),
  revenue: z.number(),
  profitRate: z.number().optional(),
  metricBasis: DashboardMetricBasisMapSchema.optional(),
});

export const DailyAdItemSchema = z.object({
  date: z.string(),
  adCost: z.number(),
  adRate: z.number().optional(),
  source: z.enum(['coupang_ads', 'listing', 'orders', 'unavailable']).optional(),
  metricBasis: DashboardMetricBasisMapSchema.optional(),
});

export const AdCoverageSchema = z.object({
  from: z.string(),
  to: z.string(),
  knownThrough: z.string().nullable(),
  targetDays: z.number().int().nonnegative(),
  completedDays: z.number().int().nonnegative(),
  missingDates: z.array(z.string()),
}).strict();

export const AdMetricSourceSchema = z.enum([
  'coupang_ads',
  'listing',
  'orders',
  'unavailable',
]);

// Our own measured ratios only. There is no configured industry reference
// data source, so the card carries no comparison figures.
export const IndustryBenchmarkSchema = z.object({
  myAdRate: z.number().optional(),
  myRoas: z.number().optional(),
  myCtr: z.number().optional(),
  myCvr: z.number().nullable().optional(),
  metricBasis: DashboardMetricBasisMapSchema.optional(),
});

export const AdMetricsDetailSchema = z.object({
  totalSpend: z.number().nullable(),
  impressions: z.number().nullable(),
  clicks: z.number().nullable(),
  convRevenue: z.number().nullable(),
  ctr: z.number().nullable(),
  roas: z.number().nullable(),
  conversions: z.number().nullable().optional(),
  cvr: z.number().nullable().optional(),
  providerConversionRate: z.number().nullable().optional(),
  coverage: AdCoverageSchema.nullable().optional(),
  source: AdMetricSourceSchema.optional(),
  prevSpend: z.number().nullable().optional(),
  prevConvRevenue: z.number().nullable().optional(),
  prevCtr: z.number().nullable().optional(),
  prevRoas: z.number().nullable().optional(),
  spendChange: z.number().nullable().optional(),
  convRevenueChange: z.number().nullable().optional(),
  roasChange: z.number().nullable().optional(),
  ctrChange: z.number().nullable().optional(),
  totalRevenue: z.number().nullable().optional(),
});

/**
 * Effective period the dashboard is displaying. Equals the calendar month
 * containing "now" by default. When the calendar month has no Order, Wing,
 * or Coupang ads activity (e.g. a Drive replay snapshot only carries data
 * for an earlier month), the backend shifts the period onto the latest data
 * month so the UI doesn't render as all-zero. `revenueSource` records which
 * data lane fed the period's monetary numbers so the UI can label
 * "Wing 매출", "Coupang 광고", "주문 기준" etc. without guessing.
 */
export const DashboardEffectivePeriodSchema = z.object({
  year: z.number(),
  month: z.number(),
  label: z.string(),
  shifted: z.boolean(),
  latestDataDate: z.string().nullable(),
  revenueSource: z.enum(['orders', 'wing', 'mixed', 'none']),
  adSource: z.enum(['orders', 'coupang_ads', 'wing', 'mixed', 'none']).optional(),
});
export type DashboardEffectivePeriod = z.infer<typeof DashboardEffectivePeriodSchema>;

// ─── Sales endpoint: GET /api/dashboard/sales ─────────────────────────────
export const DashboardSalesSummarySchema = z.object({
  today: z.object({
    revenue: z.number().nullable(),
    orders: z.number().nullable(),
  }),
  monthly: z.object({
    // `null` means the period has no complete order or Wing evidence. A
    // collected zero remains `0` and is therefore distinguishable from an
    // unavailable period.
    revenue: z.number().nullable(),
    wingRevenue: z.number().nullable().optional(), // 쿠팡 윙 매출 (분리 표시용)
    profit: z.number().nullable(),
    adRate: z.number().nullable(),
    prevRevenue: z.number().nullable(),
    prevProfit: z.number().nullable(),
    revenueChange: z.number().nullable(),
    profitChange: z.number().nullable(),
    prevAdRate: z.number().nullable(),
    available: z.boolean(),
    previousAvailable: z.boolean(),
  }),
  topProducts: z.array(TopProductSchema),
  profitDetail: ProfitBreakdownSchema.optional(),
  rangeKpi: z.object({
    range: z.string(),
    revenue: z.number().nullable(),
    profit: z.number().nullable(),
    prevRevenue: z.number().nullable(),
    prevProfit: z.number().nullable(),
    revenueChange: z.number().nullable(),
    profitChange: z.number().nullable(),
    profitRate: z.number().nullable().optional(),
    prevProfitRate: z.number().nullable().optional(),
    profitRateChange: z.number().nullable().optional(),
    available: z.boolean(),
    previousAvailable: z.boolean(),
  }).optional(),
  planAchievement: PlanAchievementSchema.nullable().optional(),
  trafficKpi: TrafficKpiSchema.optional(),
  lastSyncAt: zIsoDate.nullable().optional(),
  effectivePeriod: DashboardEffectivePeriodSchema.optional(),
  metricBasis: DashboardMetricBasisMapSchema.optional(),
  profitInputs: DashboardProfitInputsSchema.nullable().optional(),
});

// ─── Ad endpoint: GET /api/dashboard/ad ───────────────────────────────────
export const DashboardAdSummarySchema = z.object({
  monthly: z.object({
    roas: z.number().nullable(),
    ctr: z.number().nullable(),
    adRevenue: z.number().nullable(),
    totalAdSpend: z.number().nullable(),
    prevRoas: z.number().nullable(),
    prevCtr: z.number().nullable(),
    prevAdRevenue: z.number().nullable(),
    prevTotalAdSpend: z.number().nullable(),
    source: AdMetricSourceSchema.optional(),
    coverage: AdCoverageSchema.nullable().optional(),
  }),
  rangeKpi: z.object({
    adSpend: z.number().nullable(),
    adConvRevenue: z.number().nullable(),
    adRoas: z.number().nullable(),
    adCtr: z.number().nullable().optional(),
    adCost: z.number().nullable().optional(),
    adRate: z.number().nullable().optional(),
    prevAdSpend: z.number().nullable().optional(),
    prevAdConvRevenue: z.number().nullable().optional(),
    prevAdRoas: z.number().nullable().optional(),
    prevAdCtr: z.number().nullable().optional(),
    prevAdCost: z.number().nullable().optional(),
    prevAdRate: z.number().nullable().optional(),
    adSpendChange: z.number().nullable().optional(),
    adConvRevenueChange: z.number().nullable().optional(),
    adRoasChange: z.number().nullable().optional(),
    adCtrChange: z.number().nullable().optional(),
    adRateChange: z.number().nullable().optional(),
    source: AdMetricSourceSchema.optional(),
    coverage: AdCoverageSchema.nullable().optional(),
  }).optional(),
  adKpi: AdMetricsDetailSchema.optional(),
  dailyAd: z.array(DailyAdItemSchema).optional(),
  industryBenchmark: IndustryBenchmarkSchema.optional(),
  effectivePeriod: DashboardEffectivePeriodSchema.optional(),
  metricBasis: DashboardMetricBasisMapSchema.optional(),
});

// ─── Inventory endpoint: GET /api/dashboard/inventory ─────────────────────
export const DashboardInventorySummarySchema = z.object({
  totalProducts: z.number(),
  channelLinkedProducts: z.number().int().nonnegative().nullable(),
  channelUnlinkedProducts: z.number().int().nonnegative().nullable(),
  gradeCount: z.object({
    A: z.number().int().nonnegative(),
    B: z.number().int().nonnegative(),
    C: z.number().int().nonnegative(),
  }).strict(),
  abcStatusCount: z.object({
    READY: z.number().int().nonnegative(),
    INSUFFICIENT_EVIDENCE: z.number().int().nonnegative(),
    SOURCE_UNMAPPED: z.number().int().nonnegative(),
    SELLPIA_SOURCE_STALE: z.number().int().nonnegative(),
    AD_SOURCE_STALE: z.number().int().nonnegative(),
  }).strict(),
  abcContributionProfit: z.object({
    amountByGrade: z.object({
      A: z.number().int(),
      B: z.number().int(),
      C: z.number().int(),
    }).strict(),
    shareByGrade: z.object({
      A: z.number().finite().nullable(),
      B: z.number().finite().nullable(),
      C: z.number().finite().nullable(),
    }).strict(),
    basis: z.object({
      publicationRevision: z.number().int().positive().nullable(),
      officialCutoffDate: DashboardCalendarDateSchema.nullable(),
      publishedAt: zIsoDate.nullable(),
      sellpiaSourceImportRunId: z.string().uuid().nullable(),
      advertisingSourceImportRunId: z.string().uuid().nullable(),
      mappingGeneration: z.string().regex(/^\d+$/).nullable(),
      includedProductCount: z.number().int().nonnegative(),
      withheldProductCount: z.number().int().nonnegative(),
      denominator: z.number().int().nullable(),
    }).strict(),
  }).strict(),
  abcFormula: ProductAbcFormulaPayloadSchema.nullable(),
  classifiedProductCount: z.number().int().nonnegative(),
  unclassifiedProductCount: z.number().int().nonnegative(),
  alerts: z.array(DashboardAlertItemSchema),
  warnings: WarningsSchema,
  gradeChanges: GradeChangesSchema.optional(),
  metricBasis: DashboardMetricBasisMapSchema.optional(),
});

// ─── Trend endpoint: GET /api/dashboard/trend (unchanged) ─────────────────
export const DashboardTrendItemSchema = z.object({
  date: z.string(),
  revenue: z.number().nullable(),
  profit: z.number().nullable(),
  adCost: z.number().nullable(),
  metricBasis: DashboardMetricBasisMapSchema.optional(),
});

// ─── Sellpia 판매현황(몰별 매출) ──────────────────────────────────────────
// 대시보드 '몰별 매출' 섹션: 쿠팡 로켓(쿠팡-직배송) 단독 + 쿠팡윙·기타몰 합산(드릴다운).
// 소스: Sellpia sale_summary(order_search.ajax.html, mode=selldate, 주문일자 기준)를
// 확장이 판매처(seller)별로 수집 → POST /api/sellpia-sales/ingest 로 적재.

// Ingest 요청(확장 스크랩 결과) — 판매처별 일자 배열.
const SellpiaYmdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => parseBusinessDate(value) !== null, '유효한 캘린더 날짜여야 합니다.');

export const SellpiaSalesIngestDaySchema = z.object({
  date: SellpiaYmdSchema, // YYYY-MM-DD (KST 캘린더 일자)
  price: z.number().finite(), // 판매금액
  amount: z.number().finite(), // 판매수량
  buyPrice: z.number().finite(), // 매입금액
});
export const SellpiaSalesIngestSellerSchema = z.object({
  sellerId: z.string().min(1).max(64).regex(/\S/),
  sellerName: z.string().min(1).max(200).regex(/\S/),
  days: z.array(SellpiaSalesIngestDaySchema).min(1).max(100),
});
export const SellpiaSalesExplicitEmptyProvenanceSchema = z.object({
  source: z.literal('sellpia_sale_summary'),
  mode: z.literal('selldate'),
  sellerScope: z.literal('all'),
  responseShape: z.literal('empty_object'),
  explicitEmpty: z.literal(true),
});
export const SellpiaSalesIngestPayloadSchema = z.object({
  range: z.object({ from: SellpiaYmdSchema, to: SellpiaYmdSchema }),
  sellers: z.array(SellpiaSalesIngestSellerSchema).max(100),
  // sellers=[] 는 원천의 정확한 seller=all 응답이 `{}`였다는 증명이 있을 때만
  // 권위 범위 교체/coverage 저장에 사용할 수 있다.
  provenance: SellpiaSalesExplicitEmptyProvenanceSchema.optional(),
  // 원천 수집 시각이 없으면 늦게 도착한 구버전 payload가 최신 스냅샷을 덮을 수 있다.
  capturedAt: zIsoDate,
}).superRefine((payload, ctx) => {
  if (payload.sellers.length === 0 && !payload.provenance) {
    ctx.addIssue({
      code: 'custom',
      path: ['provenance'],
      message: '빈 판매현황은 원천 응답의 명시적 빈 결과 증명이 필요합니다.',
    });
  }
  if (payload.sellers.length > 0 && payload.provenance) {
    ctx.addIssue({
      code: 'custom',
      path: ['provenance'],
      message: '명시적 빈 결과 증명은 판매처가 없을 때만 사용할 수 있습니다.',
    });
  }
  if (payload.range.from > payload.range.to) {
    ctx.addIssue({ code: 'custom', path: ['range', 'from'], message: '시작일은 종료일 이후일 수 없습니다.' });
    return;
  }
  const days = Math.floor(
    (Date.parse(`${payload.range.to}T00:00:00.000Z`) -
      Date.parse(`${payload.range.from}T00:00:00.000Z`)) /
      (24 * 60 * 60 * 1000),
  ) + 1;
  if (days > 100) {
    ctx.addIssue({ code: 'custom', path: ['range'], message: '수집 범위는 최대 100일입니다.' });
  }
});
export const SellpiaSalesIngestResultSchema = z.object({
  upserted: z.number().int().nonnegative(),
  // 응답 시점에 coverage가 확인된 요청 범위 내 날짜(최신 legacy fact만 보호된 날은 제외).
  businessDates: z.array(z.string()),
  sellerCount: z.number().int().nonnegative(),
});

// Source status: GET /api/sellpia-sales/source — the organization's latest
// collection attempt and its latest COMPLETE collection, for every screen
// that starts or watches Sellpia sales collection (KID-147).
export const SellpiaSalesSourcePlanSchema = z
  .object({
    sourceType: z.literal('sellpia_sales_daily'),
    parserVersion: z.literal('sellpia-sales-v1'),
    sourceOrigin: z.literal('https://kiditem.sellpia.com'),
    sourcePath: z.literal('/sale_summary.html?mode=main_link'),
    sourceAccountKey: z.literal('kiditem'),
    range: z.object({ from: SellpiaYmdSchema, to: SellpiaYmdSchema }).strict(),
    businessDates: z.array(SellpiaYmdSchema),
  })
  .strict();
const SellpiaSalesSourceTimestampSchema = z.string().datetime({ offset: true });
export const SellpiaSalesSourceLatestAttemptSchema = z
  .object({
    attemptId: z.string().uuid(),
    // An expired RUNNING attempt reads as FAILED with ATTEMPT_EXPIRED.
    state: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
    plan: SellpiaSalesSourcePlanSchema,
    expiresAt: SellpiaSalesSourceTimestampSchema,
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
  })
  .strict();
export const SellpiaSalesSourceLatestCompleteSchema = z
  .object({
    attemptId: z.string().uuid(),
    plan: SellpiaSalesSourcePlanSchema,
    completedAt: SellpiaSalesSourceTimestampSchema,
    actualCutoffAt: SellpiaSalesSourceTimestampSchema,
    businessDates: z.array(SellpiaYmdSchema),
    rowCount: z.number().int().nonnegative(),
    sellerCount: z.number().int().nonnegative(),
  })
  .strict();
export const SellpiaSalesSourceStatusSchema = z
  .object({
    latestAttempt: SellpiaSalesSourceLatestAttemptSchema.nullable(),
    latestComplete: SellpiaSalesSourceLatestCompleteSchema.nullable(),
  })
  .strict();

// Read 응답: GET /api/sellpia-sales?from&to
export const SellpiaSalesDailyPointSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  revenue: z.number(),
  qty: z.number(),
  // Whole percent of the containing group's or mall's revenue; null when that
  // revenue is not positive. Every share is the server's; screens compute none.
  revenueShare: z.number().int().nullable(),
  // Usually inherited from the containing group `metricBasis` because the
  // group's date basis already exposes internal holes. Set this only when
  // this point has evidence that differs from the parent daily basis.
  metricBasis: DashboardMetricBasisMapSchema.optional(),
});
export const SellpiaSalesMallSchema = z.object({
  sellerId: z.string(),
  sellerName: z.string(),
  revenue: z.number(),
  qty: z.number(),
  cost: z.number(),
  // Whole percent of the group's revenue; null when that revenue is not positive.
  revenueShare: z.number().int().nullable(),
  daily: z.array(SellpiaSalesDailyPointSchema),
  // Mall scalar fields inherit the containing group's descendant basis
  // (`metricBasis['rocket.malls']` or `metricBasis['others.malls']` at the
  // summary root) when the seller uses the same selected-date basis. Do not
  // encode seller IDs as dynamic metric-basis keys; attach a row-local basis
  // only for divergence.
  metricBasis: DashboardMetricBasisMapSchema.optional(),
});
export const SellpiaSalesGroupSchema = z.object({
  revenue: z.number(),
  qty: z.number(),
  cost: z.number(),
  // Whole percent of `totalRevenue`; null when the total is not positive.
  revenueShare: z.number().int().nullable(),
  daily: z.array(SellpiaSalesDailyPointSchema),
  malls: z.array(SellpiaSalesMallSchema), // rocket 은 보통 1개, others 는 다수
  // A compact group basis can cover all group scalars when their required
  // sources share the same dates. `daily` and `malls` are separate explicit
  // descendants so consumers can inherit their basis without duplicating the
  // full date arrays on every scalar, mall, or daily point.
  metricBasis: DashboardMetricBasisMapSchema.optional(),
});
export const SellpiaSalesSummarySchema = z.object({
  knownThrough: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Null means the anchor month has no closed KST day yet, so no owner read ran.
  range: z.object({ from: z.string(), to: z.string() }).nullable(),
  rocket: SellpiaSalesGroupSchema, // 쿠팡 로켓(쿠팡-직배송) 단독
  others: SellpiaSalesGroupSchema, // 쿠팡윙 + 기타 전체몰 합산 (malls = 드릴다운)
  totalRevenue: z.number(),
  totalCost: z.number(), // 셀피아 매입금액 합계
  // 광고 계정 범위가 완전히 수집되지 않으면 광고비를 0으로 추정하지 않는다.
  adCost: z.number().finite().nullable(), // 같은 기간에 수집된 쿠팡 광고비
  netProfit: z.number().finite().nullable(), // totalRevenue - totalCost - adCost
  profitRate: z.number().finite().nullable(), // netProfit / totalRevenue * 100 (소수점 한 자리)
  lastCapturedAt: zIsoDate.nullable(),
  // True means the service has at least one valid numeric observation,
  // including an explicitly collected all-zero observation. It does not
  // claim every requested date is covered; metricBasis carries that detail.
  hasData: z.boolean(),
  // Use stable paths for root scalars and the fixed `rocket`/`others` tree
  // (`rocket.daily`, `rocket.malls`, etc.). A child inherits its nearest
  // ancestor basis when the selected-date evidence is identical; a child
  // `metricBasis` is present only when it actually differs.
  metricBasis: DashboardMetricBasisMapSchema.optional(),
  profitInputs: DashboardProfitInputsSchema.nullable().optional(),
});

// ─── Sellpia 상품별 소진(재고관리) ────────────────────────────────────────
// 상품별 이익현황(stat_prd_profit)의 월별 판매수량으로 상품별 1개월/2개월 평균
// 소진량 + 월별 추이를 산정. 재고 분석(/stock-ops) 섹션. 메이크샵 주문 기준.

// Ingest 요청(확장 크롤 결과) — 상품별 월별 배열. 매출총이익 ABC는 주문시점 원가가
// 명시된 Sellpia 상품별 이익현황 응답만 수용한다.
const SellpiaProductSalesNonnegativeIntSchema = z.number().finite().int().nonnegative();
export const SellpiaProductSalesIngestMonthSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  orderQty: SellpiaProductSalesNonnegativeIntSchema,
  orderAmount: SellpiaProductSalesNonnegativeIntSchema,
  inQty: SellpiaProductSalesNonnegativeIntSchema,
  inAmount: SellpiaProductSalesNonnegativeIntSchema,
}).strict();
export const SellpiaProductSalesIngestItemSchema = z.object({
  productCode: z.string().trim().min(1).max(64),
  optionCode: z.string().max(64),
  productName: z.string().trim().min(1).max(400),
  optionName: z.string().max(400).optional(),
  providerName: z.string().max(200).optional(),
  salePrice: SellpiaProductSalesNonnegativeIntSchema,
  buyPrice: SellpiaProductSalesNonnegativeIntSchema,
  barcode: z.string().max(64).optional(),
  // 응답에 없는 월을 클라이언트가 0으로 만들어 내지 않는다. 수집된 실제 월 버킷만
  // 전송하며, 서버는 payload-level request range로 증거 범위를 계산한다.
  months: z.array(SellpiaProductSalesIngestMonthSchema).max(24),
}).strict();
export const SellpiaProductSalesProvenanceSchema = z.object({
  source: z.literal('sellpia_stat_prd_profit'),
  costBasis: z.literal('ORDER_TIME_SUPPLY_COST'),
  vatIncluded: z.literal(true),
}).strict();
export const SellpiaProductSalesIngestPayloadSchema = z.object({
  range: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict(),
  provenance: SellpiaProductSalesProvenanceSchema,
  products: z.array(SellpiaProductSalesIngestItemSchema).max(20_000),
}).strict();
export const SellpiaProductSalesIngestResultSchema = z.object({
  upserted: z.number().int().nonnegative(),
  productCount: z.number().int().nonnegative(),
  months: z.array(z.string()),
});

// Read 응답: GET /api/sellpia-product-sales. Unit prices are transient
// collection inputs and are intentionally absent from this read model.
export const SellpiaProductSalesMonthPointSchema = z.object({
  yearMonth: z.string(),
  orderQty: z.number(),
});
export const SellpiaProductTrendSchema = z.enum(['up', 'down', 'flat']);
export const SellpiaProductDestinationDisplayImageSchema = z.object({
  url: z.string().url(),
  source: z.literal('channel_catalog'),
  channel: z.string().trim().min(1).max(100),
  channelListingId: z.string().uuid(),
  externalOptionId: z.string().min(1).nullable(),
}).strict();
export type SellpiaProductDestinationDisplayImage = z.infer<
  typeof SellpiaProductDestinationDisplayImageSchema
>;

export const SellpiaProductDestinationSchema = z.object({
  masterProductId: z.string().uuid(),
  masterProductCode: z.string().min(1),
  masterProductName: z.string().min(1),
  channelListingOptionId: z.string().uuid(),
  channelListingId: z.string().uuid(),
  channel: z.string().min(1),
  externalOptionId: z.string().min(1),
  optionName: z.string().nullable(),
  unitsPerSale: z.number().int().positive(),
  abc: ProductAbcReadModelSchema,
  displayImage: SellpiaProductDestinationDisplayImageSchema.nullable(),
}).strict();

export const SellpiaInventoryMasterProductSchema = z.object({
  masterProductId: z.string().uuid(),
  masterProductCode: z.string().min(1),
  masterProductName: z.string().min(1),
  abc: ProductAbcReadModelSchema,
}).strict();

export const SellpiaProductInventoryResolutionSchema = z.discriminatedUnion(
  'status',
  [
    z.object({
      status: z.literal('not_collected'),
    }).strict(),
    z.object({
      status: z.literal('mapping_required'),
      reason: z.enum(['not_found', 'ambiguous_barcode']),
      candidateCount: z.number().int().nonnegative(),
    }).strict(),
    z.object({
      status: z.literal('matched'),
      masterProductId: z.string().uuid(),
      currentStock: z.number().int().nonnegative(),
      salesRowCount: z.number().int().positive(),
      inventoryProduct: SellpiaInventoryMasterProductSchema.nullable(),
      destinations: z.array(SellpiaProductDestinationSchema),
    }).strict(),
  ],
);

export const SellpiaProductSalesRowSchema = z.object({
  productCode: z.string(),
  optionCode: z.string(),
  productName: z.string(),
  optionName: z.string().nullable(),
  providerName: z.string().nullable(),
  barcode: z.string().nullable(),
  monthly: z.array(SellpiaProductSalesMonthPointSchema), // 월별 추이(오름차순)
  qty1m: z.number(), // 최근 1개월(직전 완결 월) 소진량
  qty2m: z.number(), // 최근 2개월(직전 완결 2개월) 총 소진량
  avg2m: z.number(), // 2개월 월평균 = qty2m / 2
  totalQty: z.number(), // 조회범위 총 소진량
  // ─── 재고관리 파생 지표 ───
  trend: SellpiaProductTrendSchema, // 최근 소진 추세
  deadStock: z.boolean(), // 악성재고 여부(정체/급감)
  deadStockReason: z.string().nullable(), // 악성 사유
  seasonTag: z.string().nullable(), // 시즌 분류(여름/겨울/어린이날/신학기/상시), 근거 부족 시 null
  // ─── 재고 소진(발주) — 수집/매칭/가용재고 상태를 명시적으로 구분 ───
  inventoryResolution: SellpiaProductInventoryResolutionSchema,
  monthsOfAvailableStockLeft: z.number().nonnegative().nullable(),
  reorderPoint: z.number().nullable(), // 발주점 = 월평균 × (리드타임+안전)
  needsReorder: z.boolean(), // 발주 필요(현재고 ≤ 발주점)
});
export const SellpiaProductSalesSummarySchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  months: z.array(z.string()), // 조회된 연월(오름차순)
  completeMonths: z.array(z.string()), // 평균 산정 대상 완결 월
  products: z.array(SellpiaProductSalesRowSchema),
  productCount: z.number(),
  totalQty: z.number(),
  lastCapturedAt: zIsoDate.nullable(),
  hasData: z.boolean(),
  // ─── 재고관리 요약 ───
  hasStock: z.boolean(), // 재고(현재고) 수집 여부
  stockCapturedAt: zIsoDate.nullable(), // 재고 수집 시각
  stockGeneration: z.string().regex(/^\d+$/).nullable(),
  inventoryResolutionCounts: z.object({
    matchedSalesRows: z.number().int().nonnegative(),
    mappingRequiredSalesRows: z.number().int().nonnegative(),
    matchedSkus: z.number().int().nonnegative(),
    unlinkedSkus: z.number().int().nonnegative(),
  }).strict(),
  reorderCount: z.number().int().nonnegative(), // 발주 필요 distinct SKU 수
  deadStockCount: z.number().int().nonnegative(), // 악성재고 distinct SKU 수
  abcCounts: z.object({
    A: z.number().int().nonnegative(),
    B: z.number().int().nonnegative(),
    C: z.number().int().nonnegative(),
  }).strict(),
  abcStatusCounts: z.object({
    READY: z.number().int().nonnegative(),
    INSUFFICIENT_EVIDENCE: z.number().int().nonnegative(),
    SOURCE_UNMAPPED: z.number().int().nonnegative(),
    SELLPIA_SOURCE_STALE: z.number().int().nonnegative(),
    AD_SOURCE_STALE: z.number().int().nonnegative(),
  }).strict(),
  abcContributionProfitByGrade: z.object({
    A: z.number().int(),
    B: z.number().int(),
    C: z.number().int(),
  }).strict(),
  classifiedProductCount: z.number().int().nonnegative(),
  unclassifiedProductCount: z.number().int().nonnegative(),
  leadTimeMonths: z.number(), // 발주점 산정 리드타임(개월) — 에코
});

// ─── Types ────────────────────────────────────────────────────────────────
export type DashboardSalesSummary = z.infer<typeof DashboardSalesSummarySchema>;
export type DashboardAdSummary = z.infer<typeof DashboardAdSummarySchema>;
export type DashboardInventorySummary = z.infer<typeof DashboardInventorySummarySchema>;
export type DashboardTrendItem = z.infer<typeof DashboardTrendItemSchema>;
export type DashboardProfitInputs = z.infer<typeof DashboardProfitInputsSchema>;

// sub-types (exposed so backend services can use when assembling partial results)
export type ProfitBreakdown = z.infer<typeof ProfitBreakdownSchema>;
export type TopProduct = z.infer<typeof TopProductSchema>;
export type Warnings = z.infer<typeof WarningsSchema>;
export type DashboardAlertItem = z.infer<typeof DashboardAlertItemSchema>;
export type TrafficCoverage = z.infer<typeof TrafficCoverageSchema>;
export type TrafficMetricReconciliation = z.infer<typeof TrafficMetricReconciliationSchema>;
export type TrafficReconciliation = z.infer<typeof TrafficReconciliationSchema>;
export type TrafficKpi = z.infer<typeof TrafficKpiSchema>;
export type MonthlyTrendItem = z.infer<typeof MonthlyTrendItemSchema>;
export type DailyRevenueItem = z.infer<typeof DailyRevenueItemSchema>;
export type DailyAdItem = z.infer<typeof DailyAdItemSchema>;
export type AdCoverage = z.infer<typeof AdCoverageSchema>;
export type AdMetricSource = z.infer<typeof AdMetricSourceSchema>;
export type IndustryBenchmark = z.infer<typeof IndustryBenchmarkSchema>;
export type AdMetricsDetail = z.infer<typeof AdMetricsDetailSchema>;
export type PlanAchievement = z.infer<typeof PlanAchievementSchema>;
export type GradeChanges = z.infer<typeof GradeChangesSchema>;

// Sellpia 판매현황(몰별 매출)
export type SellpiaSalesIngestDay = z.infer<typeof SellpiaSalesIngestDaySchema>;
export type SellpiaSalesIngestSeller = z.infer<typeof SellpiaSalesIngestSellerSchema>;
export type SellpiaSalesExplicitEmptyProvenance = z.infer<typeof SellpiaSalesExplicitEmptyProvenanceSchema>;
export type SellpiaSalesIngestPayload = z.infer<typeof SellpiaSalesIngestPayloadSchema>;
export type SellpiaSalesIngestResult = z.infer<typeof SellpiaSalesIngestResultSchema>;
export type SellpiaSalesSourcePlan = z.infer<typeof SellpiaSalesSourcePlanSchema>;
export type SellpiaSalesSourceLatestAttempt = z.infer<typeof SellpiaSalesSourceLatestAttemptSchema>;
export type SellpiaSalesSourceLatestComplete = z.infer<typeof SellpiaSalesSourceLatestCompleteSchema>;
export type SellpiaSalesSourceStatus = z.infer<typeof SellpiaSalesSourceStatusSchema>;
export type SellpiaSalesDailyPoint = z.infer<typeof SellpiaSalesDailyPointSchema>;
export type SellpiaSalesMall = z.infer<typeof SellpiaSalesMallSchema>;
export type SellpiaSalesGroup = z.infer<typeof SellpiaSalesGroupSchema>;
export type SellpiaSalesSummary = z.infer<typeof SellpiaSalesSummarySchema>;

// Sellpia 상품별 소진(재고관리)
export type SellpiaProductSalesIngestMonth = z.infer<typeof SellpiaProductSalesIngestMonthSchema>;
export type SellpiaProductSalesIngestItem = z.infer<typeof SellpiaProductSalesIngestItemSchema>;
export type SellpiaProductSalesIngestPayload = z.infer<typeof SellpiaProductSalesIngestPayloadSchema>;
export type SellpiaProductSalesIngestResult = z.infer<typeof SellpiaProductSalesIngestResultSchema>;
export type SellpiaProductSalesMonthPoint = z.infer<typeof SellpiaProductSalesMonthPointSchema>;
export type SellpiaProductTrend = z.infer<typeof SellpiaProductTrendSchema>;
export type SellpiaProductDestination = z.infer<typeof SellpiaProductDestinationSchema>;
export type SellpiaProductInventoryResolution = z.infer<
  typeof SellpiaProductInventoryResolutionSchema
>;
export type SellpiaProductSalesRow = z.infer<typeof SellpiaProductSalesRowSchema>;
export type SellpiaProductSalesSummary = z.infer<typeof SellpiaProductSalesSummarySchema>;

// ─── Collections endpoint: GET /api/dashboard/collections ─────────────────

/**
 * When each collection last completed, so the dashboard's collection row can
 * say what it is rather than only what it does.
 *
 * Keyed by the `sourceType` the owner writes to `source_import_runs`, which is
 * a ledger that already exists — the row simply never read it. A source absent
 * from the map has never completed a run: that is not a collection at time
 * zero, it is no collection, and the two must not read the same.
 */
export const DashboardCollectionsSchema = z.object({
  lastCompleted: z.record(z.string().min(1), zIsoDate),
}).strict();

export type DashboardCollections = z.infer<typeof DashboardCollectionsSchema>;
