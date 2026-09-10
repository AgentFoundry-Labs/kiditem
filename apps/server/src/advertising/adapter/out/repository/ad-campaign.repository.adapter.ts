// Campaign / product target / trend reads off
// `ChannelAdTargetDailySnapshot` and `ChannelListingDailySnapshot`.
// Returns additive sums so downstream ratio recomputation stays in the
// domain layer.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { periodBounds, type AdPeriod } from '../../../domain/ad-metrics';
import {
  completeAdCampaignSourceIds,
  readCompleteAdKeywordFacts,
} from './ad-keyword-complete-read';
import type {
  AdCampaignRepositoryPort,
  AdTrendDailyRow,
  CampaignCurrentSweep,
  CampaignRollup,
  KeywordTargetRollup,
  ProductTargetRollup,
} from '../../../application/port/out/repository/ad-campaign.repository.port';

// Grain discriminators for `channel_ad_target_daily_snapshots`.
//
// Repository writes namespace `{ source, data }` inputs as
// `{ [source]: data }`. Prefer the authoritative campaign projection, then
// the raw projection. The final `data` path keeps compatibility with rows
// that were inserted directly before the namespacing contract was enforced.
// Rows without a stamp are classified by identity evidence instead: a
// campaign rollup carries no option/listing identity, a true product row
// always carries one. See `advertising/domain/ad-target-grain.ts`.
const STAMPED_GRAIN = Prisma.sql`
  COALESCE(
    meta_json -> 'advertising.campaign.target' ->> 'granularity',
    meta_json -> 'advertising.raw.target' ->> 'granularity',
    meta_json -> 'data' ->> 'granularity'
  )
`;

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

// Whether the scraped grid actually had a conversion-count column. See
// `CampaignRollup.conversionsObserved` — the campaign dashboard grid has none,
// so a campaign-grain zero means "not collected", not "zero conversions".
const CONVERSIONS_OBSERVED = Prisma.sql`
  COALESCE(
    meta_json -> 'advertising.campaign.target' ->> 'conversionsObserved',
    meta_json -> 'advertising.raw.target' ->> 'conversionsObserved',
    meta_json -> 'data' ->> 'conversionsObserved',
    'false'
  ) = 'true'
`;

@Injectable()
export class AdCampaignRepositoryAdapter implements AdCampaignRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findCampaignSnapshot(organizationId: string, period: AdPeriod) {
    return this.prisma.$transaction(async (tx) => ({
      rollups: await this.findCampaignRollups(tx, organizationId, period),
      currentSweeps: await this.findLatestCompleteCampaignSweeps(tx, organizationId),
    }), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  private findCampaignRollups(
    tx: Prisma.TransactionClient,
    organizationId: string,
    period: AdPeriod,
  ): Promise<CampaignRollup[]> {
    const bounds = periodBounds(period);
    return tx.$queryRaw<CampaignRollup[]>(Prisma.sql`
      WITH scoped AS (
        SELECT
          *,
          ${CONVERSIONS_OBSERVED} AS conversions_observed
        FROM channel_ad_target_daily_snapshots
        WHERE source_import_run_id IN (${completeAdCampaignSourceIds(organizationId)})
          AND organization_id = ${organizationId}::uuid
          AND business_date >= ${bounds.from}
          AND business_date <= ${bounds.to}
          AND campaign_identity IS NOT NULL
      ),
      campaign_grain AS (
        SELECT *
        FROM scoped
        WHERE
          -- Campaign rollups are the authoritative campaign-grain fact. The
          -- scrape pipeline labelled them 'product' before the grain stamp
          -- existed (pageType-derived target_type), so filtering on
          -- target_type alone left this read empty for every historical day.
          -- Keyword rows also lack product identity, hence the explicit
          -- exclusion.
          target_type <> 'keyword'
          AND ${IS_CAMPAIGN_GRAIN}
      ),
      -- Same campaign, same day, several target_key values (one per identity
      -- scheme the scraper has used). They describe the SAME Coupang row, so
      -- summing them double-counts. Keep the single best-evidenced row per day:
      -- a re-collection that produced real numbers must beat the all-zero row
      -- an earlier failed background sweep left behind.
      campaign_daily AS (
        SELECT DISTINCT ON (channel_account_id, campaign_identity, business_date)
          channel_account_id,
          campaign_identity,
          business_date,
          campaign_id,
          campaign_name,
          listing_id,
          spend,
          revenue,
          impressions,
          clicks,
          conversions,
          orders,
          conversions_observed
        FROM campaign_grain
        ORDER BY
          channel_account_id,
          campaign_identity,
          business_date,
          (spend + revenue + impressions + clicks + conversions + orders) DESC,
          updated_at DESC
      ),
      -- A successful single-campaign detail sweep currently projects one row
      -- per advertised product, not a duplicated campaign total. Fold those
      -- normalized product facts to campaign/day only as a fallback so the
      -- campaign list remains available without reading raw scrape snapshots.
      product_daily AS (
        SELECT
          channel_account_id,
          campaign_identity,
          business_date,
          MAX(campaign_id) AS campaign_id,
          MAX(campaign_name) AS campaign_name,
          NULL::uuid AS listing_id,
          SUM(spend) AS spend,
          SUM(revenue) AS revenue,
          SUM(impressions) AS impressions,
          SUM(clicks) AS clicks,
          SUM(conversions) AS conversions,
          SUM(orders) AS orders,
          bool_or(conversions_observed) AS conversions_observed
        FROM scoped
        WHERE target_type = 'product'
          AND ${IS_PRODUCT_GRAIN}
        GROUP BY channel_account_id, campaign_identity, business_date
      ),
      -- Prefer the provider campaign rollup for each campaign/day. Product
      -- fallback contributes only on days with no explicit campaign-grain
      -- row, preventing the same members from being counted twice while still
      -- allowing a period to combine explicit and fallback days.
      daily AS (
        SELECT * FROM campaign_daily
        UNION ALL
        SELECT product_daily.*
        FROM product_daily
        WHERE NOT EXISTS (
          SELECT 1
          FROM campaign_daily
          WHERE campaign_daily.channel_account_id = product_daily.channel_account_id
            AND campaign_daily.campaign_identity = product_daily.campaign_identity
            AND campaign_daily.business_date = product_daily.business_date
        )
      )
      SELECT
        channel_account_id::text || ':' || campaign_identity AS "targetKey",
        channel_account_id          AS "channelAccountId",
        campaign_identity           AS "campaignIdentity",
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
      GROUP BY channel_account_id, campaign_identity
    `);
  }

  private async findLatestCompleteCampaignSweeps(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<CampaignCurrentSweep[]> {
    const owners = await tx.$queryRaw<
      Array<{
        channelAccountId: string;
        qualityReport: {
          campaignDescriptors: Array<{
            campaignIdentity: string | null;
            campaignId: string | null;
            campaignName: string;
            status: string | null;
            onOff: string | null;
            mode: 'daily' | 'metadata' | 'raw_only';
          }>;
        };
      }>
    >(Prisma.sql`
      SELECT channel_account_id AS "channelAccountId", quality_report AS "qualityReport"
      FROM source_import_runs
      WHERE organization_id = ${organizationId}::uuid
        AND id IN (${completeAdCampaignSourceIds(organizationId)})
    `);
    return owners.map((owner) => {
      const campaigns = owner.qualityReport.campaignDescriptors;
      return {
        channelAccountId: owner.channelAccountId,
        rosterComplete: campaigns.every((campaign) => !!campaign.campaignIdentity),
        campaigns: campaigns
          .filter((campaign) => !!campaign.campaignIdentity)
          .map((campaign) => ({
            channelAccountId: owner.channelAccountId,
            campaignIdentity: campaign.campaignIdentity!,
            campaignId: campaign.campaignId,
            campaignName: campaign.campaignName,
            status: campaign.status,
            onOff: campaign.onOff,
          })),
      };
    });
  }

  findProductTargetRollups(
    organizationId: string,
    period: AdPeriod,
    campaign?: {
      channelAccountId: string;
      campaignIdentity: string;
    },
  ): Promise<ProductTargetRollup[]> {
    const bounds = periodBounds(period);
    return this.prisma.$queryRaw<ProductTargetRollup[]>(Prisma.sql`
      WITH scoped AS (
        SELECT *
        FROM channel_ad_target_daily_snapshots
        WHERE source_import_run_id IN (${completeAdCampaignSourceIds(organizationId)})
          AND organization_id = ${organizationId}::uuid
          AND target_type = 'product'
          -- Campaign rollup rows also carry target_type='product' (see the
          -- grain discriminator above). They already sum their member
          -- products, so including them double-counts every campaign that
          -- has per-product rows on the same day. The per-campaign detail
          -- table depends on this filter too: without it, selecting a
          -- campaign would list the campaign's own rollup as a "product".
          AND ${IS_PRODUCT_GRAIN}
          AND business_date >= ${bounds.from}
          AND business_date <= ${bounds.to}
          ${campaign
            ? Prisma.sql`
                AND channel_account_id = ${campaign.channelAccountId}::uuid
                AND campaign_identity = ${campaign.campaignIdentity}
              `
            : Prisma.empty}
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
          channel_account_id AS "channelAccountId",
          campaign_identity AS "campaignIdentity",
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
        latest."channelAccountId",
        latest."campaignIdentity",
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

  findKeywordTargetRollups(
    organizationId: string,
    period: AdPeriod,
    campaign?: {
      channelAccountId: string;
      campaignIdentity: string;
    },
  ): Promise<KeywordTargetRollup[]> {
    const bounds = periodBounds(period);
    return this.prisma.$transaction(
      async (tx) => {
        const { rows } = await readCompleteAdKeywordFacts(tx, organizationId, {
          ...bounds,
          ...campaign,
        });
        return rows;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  findAdTrendDailyRows(
    organizationId: string,
    dateRange: { from: Date; to: Date },
  ): Promise<AdTrendDailyRow[]> {
    return this.prisma.channelListingDailySnapshot.findMany({
      where: {
        organizationId,
        businessDate: { gte: dateRange.from, lte: dateRange.to },
      },
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
