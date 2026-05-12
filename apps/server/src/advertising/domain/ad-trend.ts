// Pure daily-row trend folding. Reads recompute ratios from additive sums;
// see also `domain/ad-metrics.ts::buildAdMetrics`.

import type { AdMetricSums } from './ad-metrics';

export interface AdTrendDailyInputRow {
  businessDate: Date;
  adSpend: number;
  adRevenue: number;
  adClicks: number;
  adImpressions: number;
  adConversions: number;
  listingId: string | null;
}

export interface AdTrendDailyAggregate {
  date: string;
  sums: AdMetricSums;
}

/**
 * Fold daily rows into one entry per `YYYY-MM-DD`, summing additive metric
 * columns. Pure mapping — callers feed this output into
 * `mapper/ad-campaign.mapper.ts::toAdTrendsData`.
 */
export function aggregateDailyAdRows(
  rows: AdTrendDailyInputRow[],
): AdTrendDailyAggregate[] {
  const dayMap = new Map<string, AdMetricSums>();
  for (const row of rows) {
    const key = row.businessDate.toISOString().slice(0, 10);
    const prev =
      dayMap.get(key) ??
      ({
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
      } as AdMetricSums);
    prev.spend += row.adSpend;
    prev.impressions += row.adImpressions;
    prev.clicks += row.adClicks;
    prev.conversions += row.adConversions;
    prev.revenue += row.adRevenue;
    dayMap.set(key, prev);
  }
  return [...dayMap.entries()].map(([date, sums]) => ({ date, sums }));
}
