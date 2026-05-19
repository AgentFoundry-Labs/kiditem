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

  findProductTargetRollups(
    organizationId: string,
    period: AdPeriod,
  ): Promise<ProductTargetRollup[]> {
    const cutoff = periodCutoff(period);
    return this.prisma.$queryRaw<ProductTargetRollup[]>(Prisma.sql`
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
      where: { id: { in: listingIds }, organizationId, isDeleted: false },
      select: { id: true, masterId: true },
    });
    const masterIds = Array.from(new Set(listings.map((l) => l.masterId)));
    const masters =
      masterIds.length > 0
        ? await this.prisma.masterProduct.findMany({
            where: { id: { in: masterIds }, organizationId },
            select: { id: true, abcGrade: true },
          })
        : [];
    const listingMap = new Map(listings.map((l) => [l.id, l]));
    const masterMap = new Map(masters.map((m) => [m.id, m]));

    for (const row of rows) {
      const listing = row.listingId ? listingMap.get(row.listingId) : null;
      const grade = listing
        ? masterMap.get(listing.masterId)?.abcGrade
        : null;
      if (grade === 'A' || grade === 'B' || grade === 'C') {
        totals[grade] += row.adSpend;
      }
    }
    return totals;
  }
}
