import type {
  AdAccountKpi,
  AdAccountKpiDayPoint,
  AdCampaignSnapshot,
  AdMetrics,
  AdTrendsData,
} from '@kiditem/shared/advertising';
import type { AdPeriod } from '../domain/ad-metrics';
import { aggregateAdMetrics, buildAdMetrics } from '../domain/ad-metrics';
import type { ScopedAdListingReadModel } from '../adapter/out/prisma/ad-listing.query';
import type {
  AdTrendDailyAggregate,
  CampaignRollup,
} from '../adapter/out/prisma/ad-campaign.query';
import type { AdAccountKpiDayRow } from '../adapter/out/prisma/ad-account-kpi.query';
import { scopedListingToSummary } from './ad-listing.mapper';

/**
 * CampaignRollup row → AdCampaignSnapshot. Campaign-grain rollups in
 * `ChannelAdTargetDailySnapshot` are not always tied to a single listing
 * (Coupang campaigns frequently span many products), so `listing` can be
 * `null`. Listings hidden by tenant scope (or soft-deleted) also surface as
 * a `null` listing so the caller cannot leak unscoped rows even when a
 * stale `listing_id` survives on the rollup row.
 */
export function toAdCampaignSnapshot(
  rollup: CampaignRollup,
  listing: ScopedAdListingReadModel | null,
  period: AdPeriod,
): AdCampaignSnapshot {
  return {
    listing: listing ? scopedListingToSummary(listing) : null,
    campaignId: rollup.campaignId,
    campaignName: rollup.campaignName,
    period,
    metrics: buildAdMetrics({
      spend: rollup.spend,
      revenue: rollup.revenue,
      impressions: rollup.impressions,
      clicks: rollup.clicks,
      conversions: campaignConversionCount(rollup),
    }),
  } satisfies AdCampaignSnapshot;
}

function campaignConversionCount(rollup: CampaignRollup): number {
  if (rollup.orders > 0) return rollup.orders;
  // Older Coupang campaign scraper payloads could map "광고 전환 매출" into
  // `conversions` when an order-count column was absent. That value is revenue
  // in KRW, not a conversion count, so surfacing it creates impossible CVR.
  if (rollup.revenue > 0 && rollup.conversions === rollup.revenue) return 0;
  return rollup.conversions;
}

/**
 * Account-level daily KPI rows (`coupang_ads_daily`) → period summary +
 * sorted daily series. `latestBusinessDate` is the max date with data.
 * The summary `AdMetrics.roas` recomputes from window totals.
 */
export function toAdAccountKpi(rows: AdAccountKpiDayRow[]): {
  summary: AdAccountKpi | null;
  daily: AdAccountKpiDayPoint[];
} {
  if (rows.length === 0) return { summary: null, daily: [] };
  const sorted = [...rows].sort((a, b) =>
    a.businessDate.localeCompare(b.businessDate),
  );
  const totalsSums = sorted.reduce(
    (acc, row) => ({
      spend: acc.spend + row.sums.spend,
      revenue: acc.revenue + row.sums.revenue,
      clicks: acc.clicks + row.sums.clicks,
      impressions: acc.impressions + row.sums.impressions,
      conversions: acc.conversions + row.sums.conversions,
    }),
    { spend: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0 },
  );
  const totalOrders = sorted.reduce((acc, row) => acc + row.orders, 0);
  const summary = {
    metrics: buildAdMetrics(totalsSums),
    orders: totalOrders,
    periodDayCount: sorted.length,
    latestBusinessDate: sorted[sorted.length - 1].businessDate,
    source: 'coupang_ads_daily',
  } satisfies AdAccountKpi;
  const daily = sorted.map(
    (row) =>
      ({
        date: row.businessDate,
        metrics: buildAdMetrics(row.sums),
        orders: row.orders,
      }) satisfies AdAccountKpiDayPoint,
  );
  return { summary, daily };
}

export type GradeBudgetTotals = Record<'A' | 'B' | 'C', number>;

export type AdTrendsMapperInput = {
  dailyAggregates: AdTrendDailyAggregate[];
  gradeBudget: GradeBudgetTotals;
  accountKpiRows: AdAccountKpiDayRow[];
};

/**
 * Daily-aggregate rows + grade budget totals → AdTrendsData.
 *
 * `daily` always carries per-listing ad metrics from
 * `ChannelListingDailySnapshot` (truthful per-listing series — zero is
 * zero, never substituted). Account-level `coupang_ads_daily` series and
 * summary land in `accountDaily`/`accountSummary` so the UI can render
 * both surfaces side-by-side without one masking the other.
 */
export function toAdTrendsData(input: AdTrendsMapperInput): AdTrendsData {
  const sortedDaily = [...input.dailyAggregates].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const daily = sortedDaily.map((row) => ({
    date: row.date,
    metrics: buildAdMetrics(row.sums),
  }));

  const account = toAdAccountKpi(input.accountKpiRows);

  const mid = Math.floor(daily.length / 2);
  const firstHalf = aggregate(daily.slice(0, mid));
  const secondHalf = aggregate(daily.slice(mid));

  return {
    daily,
    firstHalf,
    secondHalf,
    gradeBudget: input.gradeBudget,
    accountDaily: account.daily,
    accountSummary: account.summary,
  } satisfies AdTrendsData;
}

function aggregate(entries: { metrics: AdMetrics }[]): AdMetrics {
  return aggregateAdMetrics(entries);
}
