import { z } from 'zod';
import { AlertKindSchema, AlertStatusSchema } from './alerts.js';
import { zIsoDate } from './common.js';

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
  grade: z.string(),
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
  gradeCount: z.record(z.number()),
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
// 확장이 판매처(seller)별로 수집 → POST /api/dashboard/sellpia-sales/ingest 로 적재.

// Ingest 요청(확장 스크랩 결과) — 판매처별 일자 배열.
export const SellpiaSalesIngestDaySchema = z.object({
  date: z.string(), // YYYY-MM-DD (KST 캘린더 일자)
  price: z.number(), // 판매금액
  amount: z.number(), // 판매수량
  buyPrice: z.number(), // 매입금액
});
export const SellpiaSalesIngestSellerSchema = z.object({
  sellerId: z.string().min(1),
  sellerName: z.string().min(1),
  days: z.array(SellpiaSalesIngestDaySchema),
});
export const SellpiaSalesIngestPayloadSchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  sellers: z.array(SellpiaSalesIngestSellerSchema),
});
export const SellpiaSalesIngestResultSchema = z.object({
  upserted: z.number().int().nonnegative(),
  businessDates: z.array(z.string()),
  sellerCount: z.number().int().nonnegative(),
});

// Read 응답: GET /api/dashboard/sellpia-sales?from&to
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
  lastCapturedAt: zIsoDate.nullable(),
  hasData: z.boolean(),
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
export type SellpiaSalesIngestPayload = z.infer<typeof SellpiaSalesIngestPayloadSchema>;
export type SellpiaSalesIngestResult = z.infer<typeof SellpiaSalesIngestResultSchema>;
export type SellpiaSalesDailyPoint = z.infer<typeof SellpiaSalesDailyPointSchema>;
export type SellpiaSalesMall = z.infer<typeof SellpiaSalesMallSchema>;
export type SellpiaSalesGroup = z.infer<typeof SellpiaSalesGroupSchema>;
export type SellpiaSalesSummary = z.infer<typeof SellpiaSalesSummarySchema>;
