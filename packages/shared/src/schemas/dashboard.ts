import { z } from 'zod';
import { AlertKindSchema, AlertStatusSchema } from './alerts.js';
import { zIsoDate } from './common.js';
import { ProductAbcGradeSchema } from './product-abc.js';

// ─── Shared building blocks ───────────────────────────────────────────────

// schemas/dashboard.ts: DashboardAlertItemSchema — dashboard card projection
// (nullable+optional targetType/targetId; server may omit them when a card row has no polymorphic target).
// NOTE: alerts.ts defines AlertItemSchema with a required organizationId field (full DB row).
// Dashboard alerts are a projected subset (no organizationId), defined separately rather than reusing/importing.
// (Plan B2c.dashboard T9, BREAKING — was `productId`; DB schema has `targetType + targetId`)
export const DashboardAlertItemSchema = z.object({
  id: z.string(),
  kind: AlertKindSchema,
  status: AlertStatusSchema,
  type: z.string(),
  severity: z.string(),
  title: z.string(),
  message: z.string().nullable(),
  operationKey: z.string().nullable().optional(),
  sourceType: z.string().nullable().optional(),
  href: z.string().nullable().optional(),
  progress: z.number().min(0).max(1).nullable().optional(),
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
  revenue: z.number(),
  netProfit: z.number(),
  profitRate: z.number(),
});

export const MonthlyTrendItemSchema = z.object({
  period: z.string(),
  revenue: z.number(),
  profit: z.number(),
  adCost: z.number(),
});

export const ProfitBreakdownSchema = z.object({
  revenue: z.number(),
  costOfGoods: z.number(),
  commission: z.number(),
  shippingCost: z.number(),
  adCost: z.number(),
  otherCost: z.number(),
  netProfit: z.number(),
  orderCount: z.number(),
});

export const TrafficKpiSchema = z.object({
  visitors: z.number(),
  views: z.number(),
  orders: z.number(),
  salesQty: z.number(),
  revenue: z.number(),
  cartAdds: z.number(),
  date: z.string().optional(),
  periodDays: z.number().optional(),
  productCount: z.number().optional(),
  conversionRate: z.number().optional(),
  adSummary: z.record(z.any()).nullable().optional(),
  source: z.string().optional(),
  netProfit: z.number().optional(),
  profitRate: z.number().optional(),
  costCoverage: z.number().optional(),
  needsScrape: z.boolean().optional(),
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

export const DataFreshnessSchema = z.object({
  lastSync: z.string(),
  attributionWindow: z.string(),
  attributionWindowDays: z.number().optional(),
  confirmedUntil: z.string().optional(),
  note: z.string().optional(),
});

export const WarningsSchema = z.object({
  minusProducts: z.number(),
  lowProfitProducts: z.number(),
  highAdProducts: z.number(),
  outOfStockSkus: z.number(),
  mappingAttentionSkus: z.number(),
  lowCtrProducts: z.number().optional(),
  lowReviewProducts: z.number().optional(),
});

export const DailyRevenueItemSchema = z.object({
  date: z.string(),
  revenue: z.number(),
  profitRate: z.number().optional(),
});

export const DailyAdItemSchema = z.object({
  date: z.string(),
  adCost: z.number(),
  adRate: z.number().optional(),
});

export const IndustryBenchmarkSchema = z.object({
  avgAdRate: z.number(),
  avgProfitRate: z.number(),
  avgRoas: z.number(),
  avgCtr: z.number(),
  avgCvr: z.number().optional(),
  myAdRate: z.number().optional(),
  myRoas: z.number().optional(),
  myCtr: z.number().optional(),
  adRateVsIndustry: z.string().optional(),
  roasVsIndustry: z.string().optional(),
});

export const AdMetricsDetailSchema = z.object({
  totalSpend: z.number(),
  impressions: z.number(),
  clicks: z.number(),
  convRevenue: z.number(),
  ctr: z.number(),
  roas: z.number(),
  conversions: z.number().optional(),
  cvr: z.number().optional(),
  prevSpend: z.number().optional(),
  prevConvRevenue: z.number().optional(),
  prevCtr: z.number().optional(),
  prevRoas: z.number().optional(),
  spendChange: z.number().optional(),
  convRevenueChange: z.number().optional(),
  roasChange: z.number().optional(),
  ctrChange: z.number().optional(),
  totalRevenue: z.number().optional(),
});

// Wing ad-summary (A8 addition — shared between sales + ad endpoints)
export const WingAdSummarySchema = z.object({
  adRevenue: z.number(),
  adSpend: z.number(),
  adRoas: z.number(),
  rawAdSummary: z.record(z.any()).nullable().optional(),
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
  revenueSource: z.enum(['orders', 'wing', 'mixed', 'none', 'rocket', 'wing_rocket']),
  adSource: z.enum(['orders', 'coupang_ads', 'wing', 'mixed', 'none']).optional(),
});
export type DashboardEffectivePeriod = z.infer<typeof DashboardEffectivePeriodSchema>;

// ─── Sales endpoint: GET /api/dashboard/sales ─────────────────────────────
export const DashboardSalesSummarySchema = z.object({
  today: z.object({
    revenue: z.number(),
    orders: z.number(),
  }),
  monthly: z.object({
    revenue: z.number(), // 윙+로켓 합산(총 매출)
    wingRevenue: z.number().optional(), // 쿠팡 윙 매출 (분리 표시용)
    rocketRevenue: z.number().optional(), // 쿠팡 로켓(발주) 매출 (분리 표시용)
    profit: z.number(),
    adRate: z.number(),
    prevRevenue: z.number(),
    prevProfit: z.number(),
    revenueChange: z.number(),
    profitChange: z.number(),
    prevAdRate: z.number(),
  }),
  topProducts: z.array(TopProductSchema),
  monthlyTrend: z.array(MonthlyTrendItemSchema),
  profitDetail: ProfitBreakdownSchema.optional(),
  rangeKpi: z.object({
    range: z.string(),
    revenue: z.number(),
    profit: z.number(),
    prevRevenue: z.number(),
    prevProfit: z.number(),
    revenueChange: z.number(),
    profitChange: z.number(),
    profitRate: z.number().optional(),
    prevProfitRate: z.number().optional(),
    profitRateChange: z.number().optional(),
  }).optional(),
  dailyRevenue: z.array(DailyRevenueItemSchema).optional(),
  planAchievement: PlanAchievementSchema.nullable().optional(),
  trafficKpi: TrafficKpiSchema.optional(),
  lastSyncAt: zIsoDate.nullable().optional(),
  effectivePeriod: DashboardEffectivePeriodSchema.optional(),
});

// ─── Ad endpoint: GET /api/dashboard/ad ───────────────────────────────────
export const DashboardAdSummarySchema = z.object({
  monthly: z.object({
    roas: z.number(),
    ctr: z.number(),
    adRevenue: z.number(),
    totalAdSpend: z.number(),
    prevRoas: z.number(),
    prevCtr: z.number(),
    prevAdRevenue: z.number(),
    prevTotalAdSpend: z.number(),
  }),
  rangeKpi: z.object({
    adSpend: z.number(),
    adConvRevenue: z.number(),
    adRoas: z.number(),
    adCtr: z.number().optional(),
    adCost: z.number().optional(),
    adRate: z.number().optional(),
    prevAdSpend: z.number().optional(),
    prevAdConvRevenue: z.number().optional(),
    prevAdRoas: z.number().optional(),
    prevAdCtr: z.number().optional(),
    prevAdCost: z.number().optional(),
    prevAdRate: z.number().optional(),
    adSpendChange: z.number().optional(),
    adConvRevenueChange: z.number().optional(),
    adRoasChange: z.number().optional(),
    adCtrChange: z.number().optional(),
    adRateChange: z.number().optional(),
  }).optional(),
  adKpi: AdMetricsDetailSchema.optional(),
  dailyAd: z.array(DailyAdItemSchema).optional(),
  industryBenchmark: IndustryBenchmarkSchema.optional(),
  saving: z.object({
    adSaving: z.number(),
    prevAdCost: z.number(),
  }).optional(),
  // A9: ad-ops consumer needs Wing adSummary that used to live in trafficKpi.adSummary
  wingAdData: WingAdSummarySchema.nullable().optional(),
  effectivePeriod: DashboardEffectivePeriodSchema.optional(),
});

// ─── Inventory endpoint: GET /api/dashboard/inventory ─────────────────────
export const DashboardInventorySummarySchema = z.object({
  totalProducts: z.number(),
  channelLinkedProducts: z.number().int().nonnegative(),
  channelUnlinkedProducts: z.number().int().nonnegative(),
  gradeCount: z.object({
    A: z.number().int().nonnegative(),
    B: z.number().int().nonnegative(),
    C: z.number().int().nonnegative(),
  }).strict(),
  classifiedProductCount: z.number().int().nonnegative(),
  unclassifiedProductCount: z.number().int().nonnegative(),
  mappingStatusCounts: z.object({
    matched: z.number().int().nonnegative(),
    unmatched: z.number().int().nonnegative(),
    needsReview: z.number().int().nonnegative(),
  }),
  alerts: z.array(DashboardAlertItemSchema),
  warnings: WarningsSchema,
  gradeChanges: GradeChangesSchema.optional(),
  dataFreshness: DataFreshnessSchema.optional(),
});

// ─── Trend endpoint: GET /api/dashboard/trend (unchanged) ─────────────────
export const DashboardTrendItemSchema = z.object({
  date: z.string(),
  revenue: z.number(),
  profit: z.number(),
  adCost: z.number(),
});

// ─── Sellpia 판매현황(몰별 매출) ──────────────────────────────────────────
// 대시보드 '몰별 매출' 섹션: 쿠팡 로켓(쿠팡-직배송) 단독 + 쿠팡윙·기타몰 합산(드릴다운).
// 소스: Sellpia sale_summary(order_search.ajax.html, mode=selldate, 주문일자 기준)를
// 확장이 판매처(seller)별로 수집 → POST /api/sellpia-sales/ingest 로 적재.

// Ingest 요청(확장 스크랩 결과) — 판매처별 일자 배열.
const SellpiaYmdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, '유효한 캘린더 날짜여야 합니다.');

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

// Read 응답: GET /api/sellpia-sales?from&to
export const SellpiaSalesDailyPointSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  revenue: z.number(),
  qty: z.number(),
});
export const SellpiaSalesMallSchema = z.object({
  sellerId: z.string(),
  sellerName: z.string(),
  revenue: z.number(),
  qty: z.number(),
  cost: z.number(),
  daily: z.array(SellpiaSalesDailyPointSchema),
});
export const SellpiaSalesGroupSchema = z.object({
  revenue: z.number(),
  qty: z.number(),
  cost: z.number(),
  daily: z.array(SellpiaSalesDailyPointSchema),
  malls: z.array(SellpiaSalesMallSchema), // rocket 은 보통 1개, others 는 다수
});
export const SellpiaSalesSummarySchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  rocket: SellpiaSalesGroupSchema, // 쿠팡 로켓(쿠팡-직배송) 단독
  others: SellpiaSalesGroupSchema, // 쿠팡윙 + 기타 전체몰 합산 (malls = 드릴다운)
  totalRevenue: z.number(),
  totalCost: z.number(), // 셀피아 매입금액 합계
  adCost: z.number(), // 같은 기간에 수집된 쿠팡 광고비
  netProfit: z.number(), // totalRevenue - totalCost - adCost
  profitRate: z.number(), // netProfit / totalRevenue * 100 (소수점 한 자리)
  lastCapturedAt: zIsoDate.nullable(),
  // 조회 범위의 마감일(어제까지)이 모두 coverage 됐는지. 오늘 단일 조회는 당일 coverage 필요.
  hasData: z.boolean(),
});

// ─── Sellpia 상품별 소진(재고관리) ────────────────────────────────────────
// 상품별 이익현황(stat_prd_profit)의 월별 판매수량으로 상품별 1개월/2개월 평균
// 소진량 + 월별 추이를 산정. 재고 분석(/stock-ops) 섹션. 메이크샵 주문 기준.

// Ingest 요청(확장 크롤 결과) — 상품별 월별 배열.
export const SellpiaProductSalesIngestMonthSchema = z.object({
  yearMonth: z.string(), // "YYYY-MM"
  orderQty: z.number(),
  orderAmount: z.number(),
  inQty: z.number(),
  inAmount: z.number(),
});
export const SellpiaProductSalesIngestItemSchema = z.object({
  productCode: z.string().min(1),
  optionCode: z.string(),
  productName: z.string(),
  optionName: z.string().optional(),
  providerName: z.string().optional(),
  salePrice: z.number(),
  buyPrice: z.number(),
  barcode: z.string().optional(),
  months: z.array(SellpiaProductSalesIngestMonthSchema),
});
export const SellpiaProductSalesIngestPayloadSchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  products: z.array(SellpiaProductSalesIngestItemSchema),
});
export const SellpiaProductSalesIngestResultSchema = z.object({
  upserted: z.number().int().nonnegative(),
  productCount: z.number().int().nonnegative(),
  months: z.array(z.string()),
});

// Read 응답: GET /api/sellpia-product-sales
export const SellpiaProductSalesMonthPointSchema = z.object({
  yearMonth: z.string(),
  orderQty: z.number(),
  anomaly: z.boolean().optional(), // 이상치(일회성 벌크/저가 대량) 월 — 평균/등급 산정 제외
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
  productVariantId: z.string().uuid(),
  productVariantCode: z.string().min(1),
  productVariantName: z.string().min(1),
  unitsPerVariant: z.number().int().positive(),
  abcGrade: ProductAbcGradeSchema.nullable(),
  displayImage: SellpiaProductDestinationDisplayImageSchema.nullable(),
}).strict();

export const SellpiaProductInventoryResolutionSchema = z.discriminatedUnion(
  'status',
  [
    z.object({
      status: z.literal('not_collected'),
    }).strict(),
    z.object({
      status: z.literal('mapping_required'),
      reason: z.enum(['not_found', 'inactive_candidate', 'ambiguous_barcode']),
      candidateCount: z.number().int().nonnegative(),
    }).strict(),
    z.object({
      status: z.literal('matched'),
      sellpiaInventorySkuId: z.string().uuid(),
      currentStock: z.number().int().nonnegative(),
      activeCommitmentQuantity: z.number().int().nonnegative(),
      availableStock: z.number().int().nonnegative(),
      salesRowCount: z.number().int().positive(),
      destinations: z.array(SellpiaProductDestinationSchema),
    }).strict(),
  ],
).superRefine((resolution, ctx) => {
  if (resolution.status !== 'matched') return;
  const expectedAvailableStock = Math.max(
    resolution.currentStock - resolution.activeCommitmentQuantity,
    0,
  );
  if (resolution.availableStock !== expectedAvailableStock) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['availableStock'],
      message: 'availableStock must equal currentStock minus activeCommitmentQuantity',
    });
  }
});

export const SellpiaProductSalesRowSchema = z.object({
  productCode: z.string(),
  optionCode: z.string(),
  productName: z.string(),
  optionName: z.string().nullable(),
  providerName: z.string().nullable(),
  salePrice: z.number(),
  buyPrice: z.number(),
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
  anomaly: z.boolean(), // 이상치(일회성 벌크/저가 대량) 포함 — 평균/ABC/발주는 이상치 제외로 산정
  anomalyReason: z.string().nullable(), // 이상치 사유
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
  anomalyCount: z.number(), // 이상치 포함 상품 수
  abcCounts: z.object({
    A: z.number().int().nonnegative(),
    B: z.number().int().nonnegative(),
    C: z.number().int().nonnegative(),
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

// sub-types (exposed so backend services can use when assembling partial results)
export type ProfitBreakdown = z.infer<typeof ProfitBreakdownSchema>;
export type TopProduct = z.infer<typeof TopProductSchema>;
export type Warnings = z.infer<typeof WarningsSchema>;
export type DashboardAlertItem = z.infer<typeof DashboardAlertItemSchema>;
export type TrafficKpi = z.infer<typeof TrafficKpiSchema>;
export type MonthlyTrendItem = z.infer<typeof MonthlyTrendItemSchema>;
export type DailyRevenueItem = z.infer<typeof DailyRevenueItemSchema>;
export type DailyAdItem = z.infer<typeof DailyAdItemSchema>;
export type IndustryBenchmark = z.infer<typeof IndustryBenchmarkSchema>;
export type AdMetricsDetail = z.infer<typeof AdMetricsDetailSchema>;
export type PlanAchievement = z.infer<typeof PlanAchievementSchema>;
export type GradeChanges = z.infer<typeof GradeChangesSchema>;
export type DataFreshness = z.infer<typeof DataFreshnessSchema>;
export type WingAdSummary = z.infer<typeof WingAdSummarySchema>;

// Sellpia 판매현황(몰별 매출)
export type SellpiaSalesIngestDay = z.infer<typeof SellpiaSalesIngestDaySchema>;
export type SellpiaSalesIngestSeller = z.infer<typeof SellpiaSalesIngestSellerSchema>;
export type SellpiaSalesExplicitEmptyProvenance = z.infer<typeof SellpiaSalesExplicitEmptyProvenanceSchema>;
export type SellpiaSalesIngestPayload = z.infer<typeof SellpiaSalesIngestPayloadSchema>;
export type SellpiaSalesIngestResult = z.infer<typeof SellpiaSalesIngestResultSchema>;
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
