import type {
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
import { scopedListingToSummary } from './ad-listing.mapper';

/**
 * CampaignRollup row + ScopedAdListing → AdCampaignSnapshot. Listings hidden
 * by tenant scope (or soft-deleted) cause a `null` return so the caller can
 * `flatMap` them out without leaking unscoped rows.
 */
export function toAdCampaignSnapshot(
  rollup: CampaignRollup & { listingId: string },
  listing: ScopedAdListingReadModel,
  period: AdPeriod,
): AdCampaignSnapshot {
  return {
    listing: scopedListingToSummary(listing),
    campaignId: rollup.campaignId,
    campaignName: rollup.campaignName,
    period,
    metrics: buildAdMetrics({
      spend: rollup.spend,
      revenue: rollup.revenue,
      impressions: rollup.impressions,
      clicks: rollup.clicks,
      conversions: rollup.conversions,
    }),
  } satisfies AdCampaignSnapshot;
}

export type GradeBudgetTotals = Record<'A' | 'B' | 'C', number>;

export type AdTrendsMapperInput = {
  dailyAggregates: AdTrendDailyAggregate[];
  gradeBudget: GradeBudgetTotals;
};

/**
 * Daily-aggregate rows + grade budget totals → AdTrendsData. Splits the
 * daily series at the midpoint to compute first/second half comparisons,
 * recomputing ratios from sums in both halves and the daily series.
 */
export function toAdTrendsData(input: AdTrendsMapperInput): AdTrendsData {
  const sortedDaily = [...input.dailyAggregates].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const daily = sortedDaily.map((row) => ({
    date: row.date,
    metrics: buildAdMetrics(row.sums),
  }));

  const mid = Math.floor(daily.length / 2);
  const firstHalf = aggregate(daily.slice(0, mid));
  const secondHalf = aggregate(daily.slice(mid));

  return {
    daily,
    firstHalf,
    secondHalf,
    gradeBudget: input.gradeBudget,
  } satisfies AdTrendsData;
}

function aggregate(entries: { metrics: AdMetrics }[]): AdMetrics {
  return aggregateAdMetrics(entries);
}
