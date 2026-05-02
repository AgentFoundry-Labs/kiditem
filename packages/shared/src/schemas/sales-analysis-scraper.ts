import { z } from 'zod';

const isoDate = z.union([z.string(), z.date()]);

const RangeSchema = z.object({
  firstDate: z.string().nullable(), // 'YYYY-MM-DD' (KST business date)
  lastDate: z.string().nullable(),
  dateCount: z.number().int().nonnegative(),
  lastSyncedAt: isoDate.nullable(),
});

/**
 * `/api/sales-analysis/data-sources` — 매출/광고 분석 화면이 어떤 데이터 위에서
 * 동작하는지 보여주기 위한 freshness summary.
 *
 * - `wing`: `ChannelListingDailySnapshot.traffic*` 가 들어 있는 KST businessDate
 *   범위 + 마지막 관측 시각.
 * - `ads`: `ChannelAccountDailyKpiSnapshot(kpiType='coupang_ads_daily')` 일자
 *   범위 + 그 범위 안에서 비어 있는 KST businessDate 목록.
 * - `orders`: `Order.orderedAt` 범위. Drive replay 데이터에는 0 건일 수 있어서
 *   화면이 비어 있을 때 사용자가 이유를 알 수 있도록 명시한다.
 */
export const SalesAnalysisDataSourcesSchema = z.object({
  wing: RangeSchema,
  ads: RangeSchema.extend({
    missingDates: z.array(z.string()), // 'YYYY-MM-DD' (KST)
  }),
  orders: z.object({
    count: z.number().int().nonnegative(),
    firstDate: z.string().nullable(),
    lastDate: z.string().nullable(),
  }),
  generatedAt: isoDate,
});
export type SalesAnalysisDataSources = z.infer<
  typeof SalesAnalysisDataSourcesSchema
>;

const AdsDayRowSchema = z.object({
  date: z.string(), // 'YYYY-MM-DD'
  adSpend: z.number().int().nonnegative(),
  adRevenue: z.number().int().nonnegative(),
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  orders: z.number().int().nonnegative(),
  roas: z.number(), // % — recomputed from revenue/spend; 0 when spend=0
  ctr: z.number(), // ratio — recomputed from clicks/impressions; 0 when imp=0
  cvr: z.number(), // ratio — recomputed from conversions/clicks; 0 when clicks=0
});

const AdsCampaignRollupSchema = z.object({
  targetKey: z.string(),
  campaignName: z.string().nullable(),
  listingId: z.string().nullable(),
  adSpend: z.number().int().nonnegative(),
  adRevenue: z.number().int().nonnegative(),
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  roas: z.number(),
});

/**
 * `/api/sales-analysis/ads/monthly?year=&month=` — 쿠팡 광고 daily/캠페인 단위
 * 집계. daily 는 `ChannelAccountDailyKpiSnapshot`(`coupang_ads_daily`),
 * 캠페인 rollup 은 `ChannelAdTargetDailySnapshot`(`targetType='campaign'`)
 * 위에서 KST 월 윈도우(`businessDate ∈ [year-month-01, +1month)`) 합산.
 *
 * `missingDates` 는 Wing 트래픽 커버리지 vs. 광고 daily 의 차집합 — 광고가
 * 비어 있는 KST businessDate 를 명시적으로 노출해서 사용자에게 누락을
 * 숨기지 않는다.
 */
export const SalesAnalysisAdsMonthlySchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  days: z.array(AdsDayRowSchema), // ascending businessDate
  total: AdsDayRowSchema.omit({ date: true }),
  missingDates: z.array(z.string()),
  campaigns: z.array(AdsCampaignRollupSchema),
  generatedAt: isoDate,
});
export type SalesAnalysisAdsMonthly = z.infer<
  typeof SalesAnalysisAdsMonthlySchema
>;
export type SalesAnalysisAdsDayRow = z.infer<typeof AdsDayRowSchema>;
export type SalesAnalysisAdsCampaignRollup = z.infer<
  typeof AdsCampaignRollupSchema
>;
