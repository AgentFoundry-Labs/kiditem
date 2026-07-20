// Campaign / product target / trend reads off
// `ChannelAdTargetDailySnapshot` and `ChannelListingDailySnapshot`.
// Returns additive sums so downstream ratio recomputation stays in the
// domain layer.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { kstInclusiveDaysStart } from '../../../../common/kst';
import type { AdPeriod } from '../../../domain/ad-metrics';
import { periodCutoff } from '../../../domain/ad-metrics';
import type {
  AdCampaignRepositoryPort,
  AdTrendDailyRow,
  CampaignRollup,
  ProductTargetRollup,
} from '../../../application/port/out/repository/ad-campaign.repository.port';

// Grain discriminators for `channel_ad_target_daily_snapshots`.
//
// Rows written after the grain stamp landed carry an explicit
// `metaJson.data.granularity`. Legacy rows are classified by identity
// evidence instead: a campaign rollup carries no option/listing identity,
// a true product row always carries one. See
// `advertising/domain/ad-target-grain.ts` for the full rationale.
const STAMPED_GRAIN = Prisma.sql`meta_json -> 'data' ->> 'granularity'`;

const IS_PRODUCT_GRAIN = Prisma.sql`
  CASE
    WHEN ${STAMPED_GRAIN} IS NOT NULL THEN ${STAMPED_GRAIN} = 'product'
    ELSE (
      external_option_id IS NOT NULL
      OR listing_option_id IS NOT NULL
      OR listing_id IS NOT NULL
    )
  END
`;

const IS_CAMPAIGN_GRAIN = Prisma.sql`
  CASE
    WHEN ${STAMPED_GRAIN} IS NOT NULL THEN ${STAMPED_GRAIN} = 'campaign'
    ELSE (
      external_option_id IS NULL
      AND listing_option_id IS NULL
      AND listing_id IS NULL
    )
  END
`;

// One campaign accumulates several `target_key` values across time because the
// scraper's identity scheme changed underneath it:
//
//   legacy rollup   product:매출 TOP 제품:product::매출 TOP 제품::::::30개
//   collapsed href  campaign:href:https://advertising.coupang.com/.../sales
//   current         account:<uuid>:campaign:name:매출 TOP 제품
//
// Grouping by `target_key` rendered the same campaign two or three times — once
// with real numbers and again as an all-zero row (live 2026-07-20: `매출 TOP
// 제품` and `쿠팡윙 집중광고` twice, `AI스마트광고(wing)` three times). The
// campaign name is the only identifier stable across all three schemes.
const CAMPAIGN_IDENTITY = Prisma.sql`
  COALESCE(NULLIF(BTRIM(campaign_name), ''), target_key)
`;

// Whether the scraped grid actually had a conversion-count column. See
// `CampaignRollup.conversionsObserved` — the campaign dashboard grid has none,
// so a campaign-grain zero means "not collected", not "zero conversions".
const CONVERSIONS_OBSERVED = Prisma.sql`
  COALESCE(meta_json -> 'data' ->> 'conversionsObserved', 'false') = 'true'
`;

@Injectable()
export class AdCampaignRepositoryAdapter
  implements AdCampaignRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  findCampaignRollups(
    organizationId: string,
    period: AdPeriod,
    campaignName?: string,
  ): Promise<CampaignRollup[]> {
    const cutoff = periodCutoff(period);
    return this.prisma.$queryRaw<CampaignRollup[]>(Prisma.sql`
      WITH campaign_grain AS (
        SELECT
          *,
          ${CAMPAIGN_IDENTITY} AS campaign_identity,
          ${CONVERSIONS_OBSERVED} AS conversions_observed
        FROM channel_ad_target_daily_snapshots
        WHERE organization_id = ${organizationId}::uuid
          -- Campaign rollups are the authoritative campaign-grain fact. The
          -- scrape pipeline labelled them 'product' before the grain stamp
          -- existed (pageType-derived target_type), so filtering on
          -- target_type alone left this read empty for every historical day.
          -- Keyword rows also lack product identity, hence the explicit
          -- exclusion.
          AND target_type <> 'keyword'
          AND ${IS_CAMPAIGN_GRAIN}
          AND business_date >= ${cutoff}
          ${
            campaignName
              ? Prisma.sql`AND campaign_name = ${campaignName}`
              : Prisma.empty
          }
      ),
      -- Same campaign, same day, several target_key values (one per identity
      -- scheme the scraper has used). They describe the SAME Coupang row, so
      -- summing them double-counts. Keep the single best-evidenced row per day:
      -- a re-collection that produced real numbers must beat the all-zero row
      -- an earlier failed background sweep left behind.
      daily AS (
        SELECT DISTINCT ON (campaign_identity, business_date) *
        FROM campaign_grain
        ORDER BY
          campaign_identity,
          business_date,
          (spend + revenue + impressions + clicks + conversions + orders) DESC,
          updated_at DESC
      )
      SELECT
        campaign_identity           AS "targetKey",
        MAX(campaign_id)            AS "campaignId",
        MAX(campaign_name)          AS "campaignName",
        MAX(listing_id::text)::uuid AS "listingId",
        SUM(spend)::int             AS spend,
        SUM(revenue)::int           AS revenue,
        SUM(impressions)::int       AS impressions,
        SUM(clicks)::int            AS clicks,
        SUM(conversions)::int       AS conversions,
        SUM(orders)::int            AS orders,
        bool_or(conversions_observed) AS "conversionsObserved"
      FROM daily
      GROUP BY campaign_identity
    `);
  }

  findProductTargetRollups(
    organizationId: string,
    period: AdPeriod,
    campaignName?: string,
  ): Promise<ProductTargetRollup[]> {
    const cutoff = periodCutoff(period);
    return this.prisma.$queryRaw<ProductTargetRollup[]>(Prisma.sql`
      WITH scoped AS (
        SELECT *
        FROM channel_ad_target_daily_snapshots
        WHERE organization_id = ${organizationId}::uuid
          AND target_type = 'product'
          -- Campaign rollup rows also carry target_type='product' (see the
          -- grain discriminator above). They already sum their member
          -- products, so including them double-counts every campaign that
          -- has per-product rows on the same day. The per-campaign detail
          -- table depends on this filter too: without it, selecting a
          -- campaign would list the campaign's own rollup as a "product".
          AND ${IS_PRODUCT_GRAIN}
          AND business_date >= ${cutoff}
          ${
            campaignName
              ? Prisma.sql`AND campaign_name = ${campaignName}`
              : Prisma.empty
          }
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

  findAdTrendDailyRows(
    organizationId: string,
    days: number,
  ): Promise<AdTrendDailyRow[]> {
    const since = kstInclusiveDaysStart(days);
    return this.prisma.channelListingDailySnapshot.findMany({
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

  async findGradeBudgetTotals(
    organizationId: string,
    rows: AdTrendDailyRow[],
  ): Promise<Record<'A' | 'B' | 'C', number>> {
    const totals: Record<'A' | 'B' | 'C', number> = { A: 0, B: 0, C: 0 };
    const listingIds = Array.from(
      new Set(
        rows
          .map((row) => row.listingId)
          .filter((id): id is string => id != null),
      ),
    );
    if (listingIds.length === 0) return totals;

    const listings = await this.prisma.channelListing.findMany({
      where: {
        id: { in: listingIds },
        organizationId,
        isActive: true,
      },
      select: {
        id: true,
        masterProduct: { select: { abcGrade: true } },
      },
    });
    const listingMap = new Map(listings.map((listing) => [listing.id, listing]));

    for (const row of rows) {
      const listing = row.listingId ? listingMap.get(row.listingId) : null;
      const grade = listing?.masterProduct?.abcGrade;
      if (grade === 'A' || grade === 'B' || grade === 'C') {
        totals[grade] += row.adSpend;
      }
    }
    return totals;
  }
}
