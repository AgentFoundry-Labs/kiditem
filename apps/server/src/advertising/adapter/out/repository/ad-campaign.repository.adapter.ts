// Campaign / product target / trend reads off
// `ChannelAdTargetDailySnapshot` and `ChannelListingDailySnapshot`.
// Returns additive sums so downstream ratio recomputation stays in the
// domain layer.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { periodBounds, type AdPeriod } from '../../../domain/ad-metrics';
import type {
  AdCampaignRepositoryPort,
  AdTrendDailyRow,
  CampaignCurrentSweep,
  CampaignRollup,
  CampaignSyncSweepEvidence,
  ProductTargetRollup,
} from '../../../application/port/out/repository/ad-campaign.repository.port';

type CampaignSweepQueryRow = {
  channelAccountId: string;
  collectionRunId: string;
  collectionAttempt: number;
  completedAt: Date;
  campaignDailyCollectionComplete: boolean;
  campaignDailyWindowDays: number | null;
  campaignDailyFrom: string | null;
  campaignDailyTo: string | null;
  rosterComplete: boolean;
  dailyFactsComplete: boolean;
  campaignIdentity: string | null;
  campaignId: string | null;
  campaignName: string | null;
  status: string | null;
  onOff: string | null;
};

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
export class AdCampaignRepositoryAdapter
  implements AdCampaignRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  findCampaignRollups(
    organizationId: string,
    period: AdPeriod,
  ): Promise<CampaignRollup[]> {
    const bounds = periodBounds(period);
    return this.prisma.$queryRaw<CampaignRollup[]>(Prisma.sql`
      WITH scoped AS (
        SELECT
          *,
          ${CONVERSIONS_OBSERVED} AS conversions_observed
        FROM channel_ad_target_daily_snapshots
        WHERE organization_id = ${organizationId}::uuid
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

  async findLatestCompleteCampaignSweeps(
    organizationId: string,
  ): Promise<CampaignCurrentSweep[]> {
    return this.queryLatestCompleteCampaignSweeps(organizationId, null);
  }

  async findAccountlessSyncCampaignSweep(
    organizationId: string,
  ): Promise<CampaignSyncSweepEvidence | null> {
    const account = await this.prisma.channelAccount.findFirst({
      where: { organizationId, channel: 'coupang', status: 'active' },
      // Must remain identical to AdListingRepositoryAdapter's account-less
      // ingest resolver. Until the browser supplies an account picker, both
      // ingest and freshness bind to this deterministic account.
      orderBy: [
        { isPrimary: 'desc' },
        { updatedAt: 'desc' },
        { id: 'asc' },
      ],
      select: { id: true },
    });
    if (!account) return null;

    const [sweep] = await this.queryLatestCompleteCampaignSweeps(
      organizationId,
      account.id,
    );
    return sweep ?? null;
  }

  private async queryLatestCompleteCampaignSweeps(
    organizationId: string,
    channelAccountId: string | null,
  ): Promise<CampaignSyncSweepEvidence[]> {
    const rows = await this.prisma.$queryRaw<CampaignSweepQueryRow[]>(
      Prisma.sql`
        WITH latest_marker AS (
          SELECT DISTINCT ON (channel_account_id)
            id AS marker_run_id,
            channel_account_id,
            meta_json ->> 'collectionRunId' AS collection_run_id,
            (meta_json ->> 'collectionAttempt')::int AS collection_attempt,
            (meta_json ->> 'campaignCount')::int AS expected_campaign_count,
            COALESCE(
              meta_json ->> 'campaignIdentityComplete' = 'true',
              false
            ) AS identity_complete,
            COALESCE(
              meta_json ->> 'campaignDailyCollectionComplete' = 'true',
              false
            ) AS daily_collection_complete,
            CASE
              WHEN (meta_json ->> 'campaignDailyWindowDays') ~ '^[1-9][0-9]*$'
              THEN (meta_json ->> 'campaignDailyWindowDays')::int
              ELSE NULL
            END AS daily_window_days,
            NULLIF(BTRIM(meta_json ->> 'campaignDailyFrom'), '')
              AS daily_from,
            NULLIF(BTRIM(meta_json ->> 'campaignDailyTo'), '')
              AS daily_to,
            finished_at AS marker_finished_at,
            COALESCE(finished_at, started_at) AS marker_completed_at
          FROM channel_scrape_runs
          WHERE organization_id = ${organizationId}::uuid
            ${channelAccountId
              ? Prisma.sql`AND channel_account_id = ${channelAccountId}::uuid`
              : Prisma.empty}
            AND channel = 'coupang'
            AND source = 'advertising'
            AND page_type = 'campaign'
            AND status = 'complete'
            AND error_count = 0
            AND meta_json ->> 'campaignSweepComplete' = 'true'
            AND jsonb_typeof(meta_json -> 'collectionRunId') = 'string'
            AND NULLIF(BTRIM(meta_json ->> 'collectionRunId'), '') IS NOT NULL
            AND jsonb_typeof(meta_json -> 'collectionAttempt') = 'number'
            AND (meta_json ->> 'collectionAttempt') ~ '^[1-9][0-9]*$'
            AND jsonb_typeof(meta_json -> 'campaignCount') = 'number'
            AND (meta_json ->> 'campaignCount') ~ '^[0-9]+$'
          ORDER BY
            channel_account_id,
            finished_at DESC NULLS LAST,
            started_at DESC,
            id DESC
        ),
        observed_snapshots AS (
          SELECT
            marker.channel_account_id,
            marker.collection_run_id,
            marker.collection_attempt,
            marker.daily_from,
            marker.daily_to,
            observed_run.business_date,
            observed_run.period_start,
            observed_run.period_end,
            observed_run.meta_json ->> 'requestedCampaignReportScope'
              AS requested_scope,
            observed_run.meta_json ->> 'effectiveCampaignReportScope'
              AS effective_scope,
            COALESCE(
              observed_run.meta_json ->> 'dailyProjectionSkipped' = 'true',
              true
            ) AS daily_projection_skipped,
            snapshot.id AS snapshot_id,
            NULLIF(
              BTRIM(snapshot.normalized_json ->> 'campaignIdentity'),
              ''
            ) AS campaign_identity,
            NULLIF(
              BTRIM(snapshot.normalized_json ->> 'campaignId'),
              ''
            ) AS campaign_id,
            NULLIF(
              BTRIM(snapshot.normalized_json ->> 'campaignName'),
              ''
            ) AS campaign_name,
            COALESCE(
              NULLIF(BTRIM(observed_run.meta_json ->> 'dashboardStatus'), ''),
              NULLIF(BTRIM(snapshot.normalized_json ->> 'status'), '')
            ) AS status,
            COALESCE(
              NULLIF(BTRIM(observed_run.meta_json ->> 'dashboardOnOff'), ''),
              NULLIF(BTRIM(snapshot.normalized_json ->> 'onOff'), '')
            ) AS on_off,
            snapshot.observed_at,
            snapshot.created_at,
            snapshot.id
          FROM latest_marker marker
          JOIN channel_scrape_runs observed_run
            ON observed_run.organization_id = ${organizationId}::uuid
           AND observed_run.channel_account_id = marker.channel_account_id
           AND observed_run.channel = 'coupang'
           AND observed_run.source = 'advertising'
           AND observed_run.page_type = 'campaign'
           AND observed_run.status = 'complete'
           AND observed_run.error_count = 0
           AND observed_run.id <> marker.marker_run_id
           AND observed_run.finished_at <= marker.marker_finished_at
           AND observed_run.meta_json ->> 'collectionRunId' =
             marker.collection_run_id
           AND observed_run.meta_json ->> 'collectionAttempt' =
             marker.collection_attempt::text
          JOIN channel_scrape_snapshots snapshot
            ON snapshot.organization_id = observed_run.organization_id
           AND snapshot.scrape_run_id = observed_run.id
          WHERE NULLIF(
            BTRIM(snapshot.normalized_json ->> 'campaignIdentity'),
            ''
          ) IS NOT NULL
        ),
        campaign_rows AS (
          SELECT DISTINCT ON (
            observed.channel_account_id,
            observed.campaign_identity
          )
            observed.channel_account_id,
            observed.collection_run_id,
            observed.collection_attempt,
            observed.campaign_identity,
            observed.campaign_id,
            observed.campaign_name,
            observed.status,
            observed.on_off
          FROM observed_snapshots observed
          ORDER BY
            observed.channel_account_id,
            observed.campaign_identity,
            observed.observed_at DESC,
            observed.created_at DESC,
            observed.id DESC
        ),
        campaign_counts AS (
          SELECT
            channel_account_id,
            collection_run_id,
            collection_attempt,
            COUNT(*)::int AS observed_campaign_count
          FROM campaign_rows
          GROUP BY
            channel_account_id,
            collection_run_id,
            collection_attempt
        ),
        campaign_classification AS (
          SELECT
            channel_account_id,
            collection_run_id,
            collection_attempt,
            campaign_identity,
            BOOL_OR(
              requested_scope = 'single_campaign_metadata_raw'
            ) AS has_explicit_metadata_only,
            BOOL_OR(
              effective_scope = 'single_campaign_authoritative'
              AND daily_projection_skipped = false
            ) AS has_authoritative_detail
          FROM observed_snapshots
          GROUP BY
            channel_account_id,
            collection_run_id,
            collection_attempt,
            campaign_identity
        ),
        authoritative_campaign_days AS (
          SELECT DISTINCT
            observed.channel_account_id,
            observed.collection_run_id,
            observed.collection_attempt,
            observed.campaign_identity,
            observed.business_date
          FROM observed_snapshots observed
          JOIN channel_ad_target_daily_snapshots fact
           ON fact.organization_id = ${organizationId}::uuid
           AND fact.channel_account_id = observed.channel_account_id
           AND fact.raw_snapshot_id = observed.snapshot_id
           AND fact.business_date = observed.business_date
          WHERE
            observed.effective_scope = 'single_campaign_authoritative'
            AND observed.daily_projection_skipped = false
            AND observed.business_date IS NOT NULL
            AND observed.period_start = observed.business_date
            AND observed.period_end = observed.business_date
            AND TO_CHAR(observed.business_date, 'YYYY-MM-DD')
              BETWEEN observed.daily_from AND observed.daily_to
        ),
        campaign_daily_coverage AS (
          SELECT
            channel_account_id,
            collection_run_id,
            collection_attempt,
            campaign_identity,
            COUNT(DISTINCT business_date)::int AS observed_day_count,
            TO_CHAR(MIN(business_date), 'YYYY-MM-DD') AS observed_from,
            TO_CHAR(MAX(business_date), 'YYYY-MM-DD') AS observed_to
          FROM authoritative_campaign_days
          GROUP BY
            channel_account_id,
            collection_run_id,
            collection_attempt,
            campaign_identity
        )
        SELECT
          marker.channel_account_id AS "channelAccountId",
          marker.collection_run_id AS "collectionRunId",
          marker.collection_attempt AS "collectionAttempt",
          marker.marker_completed_at AS "completedAt",
          marker.daily_collection_complete AS "campaignDailyCollectionComplete",
          marker.daily_window_days AS "campaignDailyWindowDays",
          marker.daily_from AS "campaignDailyFrom",
          marker.daily_to AS "campaignDailyTo",
          (
            marker.identity_complete
            AND
            COALESCE(counts.observed_campaign_count, 0) =
            marker.expected_campaign_count
          ) AS "rosterComplete",
          (
            marker.identity_complete
            AND
            COALESCE(counts.observed_campaign_count, 0) =
              marker.expected_campaign_count
            AND
            (
              marker.expected_campaign_count = 0
              OR NOT EXISTS (
                SELECT 1
                FROM campaign_rows required_campaign
                LEFT JOIN campaign_classification classification
                  ON classification.channel_account_id =
                    required_campaign.channel_account_id
                 AND classification.collection_run_id =
                    required_campaign.collection_run_id
                 AND classification.collection_attempt =
                    required_campaign.collection_attempt
                 AND classification.campaign_identity =
                    required_campaign.campaign_identity
                LEFT JOIN campaign_daily_coverage coverage
                  ON coverage.channel_account_id =
                    required_campaign.channel_account_id
                 AND coverage.collection_run_id =
                    required_campaign.collection_run_id
                 AND coverage.collection_attempt =
                    required_campaign.collection_attempt
                 AND coverage.campaign_identity =
                    required_campaign.campaign_identity
                WHERE
                  required_campaign.channel_account_id =
                    marker.channel_account_id
                  AND required_campaign.collection_run_id =
                    marker.collection_run_id
                  AND required_campaign.collection_attempt =
                    marker.collection_attempt
                  AND NOT (
                    COALESCE(
                      (
                        COALESCE(
                          classification.has_authoritative_detail,
                          false
                        )
                      AND coverage.observed_day_count =
                        marker.daily_window_days
                      AND coverage.observed_from = marker.daily_from
                      AND coverage.observed_to = marker.daily_to
                      ),
                      false
                    )
                    OR (
                      COALESCE(
                        classification.has_authoritative_detail,
                        false
                      ) = false
                      AND COALESCE(
                        classification.has_explicit_metadata_only,
                        false
                      )
                    )
                  )
              )
            )
          ) AS "dailyFactsComplete",
          campaign.campaign_identity AS "campaignIdentity",
          campaign.campaign_id AS "campaignId",
          campaign.campaign_name AS "campaignName",
          campaign.status,
          campaign.on_off AS "onOff"
        FROM latest_marker marker
        LEFT JOIN campaign_counts counts
          ON counts.channel_account_id = marker.channel_account_id
         AND counts.collection_run_id = marker.collection_run_id
         AND counts.collection_attempt = marker.collection_attempt
        LEFT JOIN campaign_rows campaign
          ON campaign.channel_account_id = marker.channel_account_id
         AND campaign.collection_run_id = marker.collection_run_id
         AND campaign.collection_attempt = marker.collection_attempt
        ORDER BY
          marker.channel_account_id,
          campaign.campaign_identity
      `,
    );

    const sweeps = new Map<string, CampaignSyncSweepEvidence>();
    for (const row of rows) {
      let sweep = sweeps.get(row.channelAccountId);
      if (!sweep) {
        sweep = {
          channelAccountId: row.channelAccountId,
          collectionRunId: row.collectionRunId,
          collectionAttempt: row.collectionAttempt,
          completedAt: row.completedAt,
          campaignDailyCollectionComplete:
            row.campaignDailyCollectionComplete,
          campaignDailyWindowDays: row.campaignDailyWindowDays,
          campaignDailyFrom: row.campaignDailyFrom,
          campaignDailyTo: row.campaignDailyTo,
          rosterComplete: row.rosterComplete,
          dailyFactsComplete: row.dailyFactsComplete,
          campaigns: [],
        };
        sweeps.set(row.channelAccountId, sweep);
      }
      if (row.campaignIdentity) {
        sweep.campaigns.push({
          channelAccountId: row.channelAccountId,
          campaignIdentity: row.campaignIdentity,
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          status: row.status,
          onOff: row.onOff,
        });
      }
    }
    return [...sweeps.values()];
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
        WHERE organization_id = ${organizationId}::uuid
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
