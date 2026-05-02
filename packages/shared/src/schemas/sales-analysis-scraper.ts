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
