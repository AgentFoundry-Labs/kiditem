import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { kstInclusiveDaysStart } from '../../../../common/kst';
import type { AdMetricSums, AdPeriod } from '../../../domain/ad-metrics';
import { periodCutoff } from '../../../domain/ad-metrics';

export type CampaignRollup = {
  targetKey: string;
  campaignId: string | null;
  campaignName: string | null;
  listingId: string | null;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  orders: number;
};

export type AdTrendDailyAggregate = {
  date: string;
  sums: AdMetricSums;
};

export type AdTrendDailyRow = {
  businessDate: Date;
  adSpend: number;
  adRevenue: number;
  adClicks: number;
  adImpressions: number;
  adConversions: number;
  listingId: string | null;
};

/**
 * Campaign-grain rollup from `ChannelAdTargetDailySnapshot`. Aggregates
 * `targetType='campaign'` rows by `targetKey` over the requested period
 * cutoff. Tenant predicate is bound on every row.
 */
export async function findCampaignRollups(
  prisma: PrismaService,
  organizationId: string,
  period: AdPeriod,
  campaignName?: string,
): Promise<CampaignRollup[]> {
  const cutoff = periodCutoff(period);
  return prisma.$queryRaw<CampaignRollup[]>(Prisma.sql`
    SELECT
      target_key                  AS "targetKey",
      MAX(campaign_id)            AS "campaignId",
      MAX(campaign_name)          AS "campaignName",
      MAX(listing_id::text)::uuid AS "listingId",
      SUM(spend)::int             AS spend,
      SUM(revenue)::int           AS revenue,
      SUM(impressions)::int       AS impressions,
      SUM(clicks)::int            AS clicks,
      SUM(conversions)::int       AS conversions,
      SUM(orders)::int            AS orders
    FROM channel_ad_target_daily_snapshots
    WHERE organization_id = ${organizationId}::uuid
      AND target_type = 'campaign'
      AND business_date >= ${cutoff}
      ${
        campaignName
          ? Prisma.sql`AND campaign_name = ${campaignName}`
          : Prisma.empty
      }
    GROUP BY target_key
  `);
}

/**
 * Daily ad rows for trend aggregation. Reads `ChannelListingDailySnapshot`
 * over the requested period (clamped to `<=90`) and returns one row per
 * (listingId, businessDate). Caller folds them into per-day sums and
 * splits at the midpoint for first/second half comparison.
 */
export async function findAdTrendDailyRows(
  prisma: PrismaService,
  organizationId: string,
  days: number,
): Promise<AdTrendDailyRow[]> {
  const since = kstInclusiveDaysStart(days);
  return prisma.channelListingDailySnapshot.findMany({
    where: { organizationId, businessDate: { gte: since } },
    select: {
      businessDate: true,
      adSpend: true,
      adRevenue: true,
      adClicks: true,
      adImpressions: true,
      adConversions: true,
      listingId: true,
    },
    orderBy: { businessDate: 'asc' },
  });
}

/**
 * Fold daily rows into one entry per `YYYY-MM-DD`, summing additive metric
 * columns. Pure mapping helper kept here so the read-model owns the daily
 * grouping shape consumed by `mapper/ad-campaign.mapper.ts::toAdTrendsData`.
 */
export function aggregateDailyAdRows(
  rows: AdTrendDailyRow[],
): AdTrendDailyAggregate[] {
  const dayMap = new Map<string, AdMetricSums>();
  for (const row of rows) {
    const key = row.businessDate.toISOString().slice(0, 10);
    const prev = dayMap.get(key) ?? {
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
    };
    prev.spend += row.adSpend;
    prev.impressions += row.adImpressions;
    prev.clicks += row.adClicks;
    prev.conversions += row.adConversions;
    prev.revenue += row.adRevenue;
    dayMap.set(key, prev);
  }
  return [...dayMap.entries()].map(([date, sums]) => ({ date, sums }));
}

/**
 * For each daily row, attach the listing's ABC grade and accumulate adSpend
 * into the matching `gradeBudget` bucket. listings/masters that escape the
 * tenant scope drop out (no `gradeBudget` contribution).
 */
export async function findGradeBudgetTotals(
  prisma: PrismaService,
  organizationId: string,
  rows: AdTrendDailyRow[],
): Promise<Record<'A' | 'B' | 'C', number>> {
  const totals: Record<'A' | 'B' | 'C', number> = { A: 0, B: 0, C: 0 };
  const listingIds = Array.from(
    new Set(rows.map((row) => row.listingId).filter((id): id is string => id != null)),
  );
  if (listingIds.length === 0) return totals;

  const listings = await prisma.channelListing.findMany({
    where: { id: { in: listingIds }, organizationId, isDeleted: false },
    select: { id: true, masterId: true },
  });
  const masterIds = Array.from(new Set(listings.map((l) => l.masterId)));
  const masters = masterIds.length > 0
    ? await prisma.masterProduct.findMany({
        where: { id: { in: masterIds }, organizationId },
        select: { id: true, abcGrade: true },
      })
    : [];
  const listingMap = new Map(listings.map((l) => [l.id, l]));
  const masterMap = new Map(masters.map((m) => [m.id, m]));

  for (const row of rows) {
    const listing = row.listingId ? listingMap.get(row.listingId) : null;
    const grade = listing ? masterMap.get(listing.masterId)?.abcGrade : null;
    if (grade === 'A' || grade === 'B' || grade === 'C') {
      totals[grade] += row.adSpend;
    }
  }
  return totals;
}
