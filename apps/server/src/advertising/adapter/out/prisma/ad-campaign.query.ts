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

export type ProductTargetRollup = {
  targetKey: string;
  campaignId: string | null;
  campaignName: string | null;
  listingId: string | null;
  listingOptionId: string | null;
  optionId: string | null;
  externalId: string | null;
  externalOptionId: string | null;
  keyword: string | null;
  status: string | null;
  onOff: string | null;
  metaJson: unknown | null;
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
 * Product-grain rollup from `ChannelAdTargetDailySnapshot.targetType='product'`.
 * This is the normalized source for the ad-products tab. Raw scrape snapshots
 * remain audit/replay evidence only and are never the product-list API source.
 */
export async function findProductTargetRollups(
  prisma: PrismaService,
  organizationId: string,
  period: AdPeriod,
): Promise<ProductTargetRollup[]> {
  const cutoff = periodCutoff(period);
  return prisma.$queryRaw<ProductTargetRollup[]>(Prisma.sql`
    WITH scoped AS (
      SELECT *
      FROM channel_ad_target_daily_snapshots
      WHERE organization_id = ${organizationId}::uuid
        AND target_type = 'product'
        AND business_date >= ${cutoff}
    ),
    rollups AS (
      SELECT
        target_key        AS "targetKey",
        SUM(spend)::int   AS spend,
        SUM(revenue)::int AS revenue,
        SUM(impressions)::int AS impressions,
        SUM(clicks)::int AS clicks,
        SUM(conversions)::int AS conversions,
        SUM(orders)::int AS orders
      FROM scoped
      GROUP BY target_key
    ),
    latest AS (
      SELECT DISTINCT ON (target_key)
        target_key AS "targetKey",
        campaign_id AS "campaignId",
        campaign_name AS "campaignName",
        listing_id::text AS "listingId",
        listing_option_id::text AS "listingOptionId",
        option_id::text AS "optionId",
        external_id AS "externalId",
        external_option_id AS "externalOptionId",
        keyword,
        status,
        on_off AS "onOff",
        meta_json AS "metaJson"
      FROM scoped
      ORDER BY target_key, business_date DESC, updated_at DESC
    )
    SELECT
      rollups."targetKey",
      latest."campaignId",
      latest."campaignName",
      latest."listingId"::uuid AS "listingId",
      latest."listingOptionId"::uuid AS "listingOptionId",
      latest."optionId"::uuid AS "optionId",
      latest."externalId",
      latest."externalOptionId",
      latest.keyword,
      latest.status,
      latest."onOff",
      latest."metaJson",
      rollups.spend,
      rollups.revenue,
      rollups.impressions,
      rollups.clicks,
      rollups.conversions,
      rollups.orders
    FROM rollups
    JOIN latest USING ("targetKey")
    ORDER BY rollups.revenue DESC, rollups.spend DESC, rollups."targetKey" ASC
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
