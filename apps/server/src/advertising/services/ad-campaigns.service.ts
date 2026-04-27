import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { kstDayStart } from '../../common/kst';
import { AdConfigService } from './ad-config.service';
import { LISTING_SUMMARY_SELECT } from './types';
import {
  recomputeRoas,
  recomputeCtr,
  recomputeCvr,
} from '../util/ratio-recompute';
import type {
  AdCampaignSnapshot,
  AdListingSummary,
  AdMetrics,
  AdTrendsData,
} from '@kiditem/shared';

export type CampaignsPeriod = '7d' | '14d' | 'month';

function buildMetrics(sums: {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}): AdMetrics {
  const { spend, impressions, clicks, conversions, revenue } = sums;
  return {
    spend,
    impressions,
    clicks,
    conversions,
    revenue,
    ctr: recomputeCtr(clicks, impressions),
    roas: recomputeRoas(revenue, spend),
    cvr: recomputeCvr(conversions, clicks),
  };
}

export function periodToDays(period: CampaignsPeriod, fallback = 14): number {
  if (period === '7d') return 7;
  if (period === 'month') {
    // KST day-of-month — server may be UTC (Docker prod runs UTC-default TZ)
    const kstDay = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDate();
    return Math.max(kstDay, 1);
  }
  return fallback;
}

function periodCutoff(period: CampaignsPeriod): Date {
  const days = periodToDays(period, 14);
  // KST day start — period cutoff anchored at Asia/Seoul midnight (Docker prod runs UTC)
  const today = kstDayStart(new Date());
  return new Date(today.getTime() - days * 86_400_000);
}

@Injectable()
export class AdCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adConfigService: AdConfigService,
  ) {}

  /**
   * H3 — campaign-grain rollup from `ChannelAdTargetDailySnapshot`. Aggregates
   * the `targetType='campaign'` rows by `(targetKey)` over the requested
   * period. Period mapping: `7d`→7 days, `14d`→14 days, `month`→days-of-month.
   * Ratios recompute via util/ratio-recompute.
   */
  async getCampaigns(
    period: CampaignsPeriod,
    campaignName: string | undefined,
    companyId: string,
  ): Promise<AdCampaignSnapshot[]> {
    const cutoff = periodCutoff(period);

    type CampaignRollup = {
      targetKey: string;
      campaignId: string | null;
      campaignName: string | null;
      listingId: string | null;
      spend: number;
      revenue: number;
      impressions: number;
      clicks: number;
      conversions: number;
    };

    // GROUP BY targetKey. listingId / campaignId / campaignName surface via
    // MAX (canonical key already unique per row, so any aggregator works).
    const rollups = await this.prisma.$queryRaw<CampaignRollup[]>(Prisma.sql`
      SELECT
        target_key                  AS "targetKey",
        MAX(campaign_id)            AS "campaignId",
        MAX(campaign_name)          AS "campaignName",
        MAX(listing_id::text)::uuid AS "listingId",
        SUM(spend)::int             AS spend,
        SUM(revenue)::int           AS revenue,
        SUM(impressions)::int       AS impressions,
        SUM(clicks)::int            AS clicks,
        SUM(conversions)::int       AS conversions
      FROM channel_ad_target_daily_snapshots
      WHERE company_id = ${companyId}::uuid
        AND target_type = 'campaign'
        AND business_date >= ${cutoff}
        ${
          campaignName
            ? Prisma.sql`AND campaign_name = ${campaignName}`
            : Prisma.empty
        }
      GROUP BY target_key
    `);

    const rollupsWithListing = rollups.filter(
      (r): r is CampaignRollup & { listingId: string } => r.listingId != null,
    );
    if (rollupsWithListing.length === 0) return [];

    const listingIds = Array.from(
      new Set(rollupsWithListing.map((r) => r.listingId)),
    );

    const listings = await this.prisma.channelListing.findMany({
      where: { id: { in: listingIds }, companyId, isDeleted: false },
      select: LISTING_SUMMARY_SELECT,
    });
    const listingMap = new Map(listings.map((l) => [l.id, l]));

    return rollupsWithListing.flatMap((r) => {
      const listing = listingMap.get(r.listingId);
      if (!listing) return [];
      const summary: AdListingSummary = {
        listingId: listing.id,
        externalId: listing.externalId,
        channelName: listing.channelName,
        masterProduct: {
          id: listing.master.id,
          code: listing.master.code,
          name: listing.master.name,
        },
        option: null,
      };
      return [
        {
          listing: summary,
          campaignId: r.campaignId,
          campaignName: r.campaignName,
          period,
          metrics: buildMetrics({
            spend: r.spend,
            revenue: r.revenue,
            impressions: r.impressions,
            clicks: r.clicks,
            conversions: r.conversions,
          }),
        } satisfies AdCampaignSnapshot,
      ];
    });
  }

  /**
   * H3 — daily ad trend from `ChannelListingDailySnapshot` aggregated by
   * `businessDate`. Each daily row already represents one day of additive
   * spend/revenue/etc per listing — sum across listings to get the trend
   * point.
   */
  async getTrends(
    period: CampaignsPeriod,
    days: number | undefined,
    companyId: string,
  ): Promise<AdTrendsData> {
    const d = period ? periodToDays(period) : Math.min(days ?? 14, 90);
    const today = kstDayStart(new Date());
    const since = new Date(today.getTime() - d * 86_400_000);

    const dailies = await this.prisma.channelListingDailySnapshot.findMany({
      where: { companyId, businessDate: { gte: since } },
      select: {
        businessDate: true,
        adSpend: true,
        adRevenue: true,
        adClicks: true,
        adImpressions: true,
        adConversions: true,
        listing: { select: { master: { select: { abcGrade: true } } } },
      },
      orderBy: { businessDate: 'asc' },
    });

    const dayMap = new Map<
      string,
      {
        spend: number;
        impressions: number;
        clicks: number;
        conversions: number;
        revenue: number;
      }
    >();

    for (const row of dailies) {
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

    const daily = [...dayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sums]) => ({ date, metrics: buildMetrics(sums) }));

    const mid = Math.floor(daily.length / 2);
    const firstHalf = this.aggregate(daily.slice(0, mid));
    const secondHalf = this.aggregate(daily.slice(mid));

    const gradeBudget: Record<'A' | 'B' | 'C', number> = { A: 0, B: 0, C: 0 };
    for (const row of dailies) {
      const grade = row.listing?.master?.abcGrade;
      if (grade === 'A' || grade === 'B' || grade === 'C') {
        gradeBudget[grade] += row.adSpend;
      }
    }

    return { daily, firstHalf, secondHalf, gradeBudget } satisfies AdTrendsData;
  }

  private aggregate(entries: { metrics: AdMetrics }[]): AdMetrics {
    const sums = entries.reduce(
      (acc, e) => ({
        spend: acc.spend + e.metrics.spend,
        impressions: acc.impressions + e.metrics.impressions,
        clicks: acc.clicks + e.metrics.clicks,
        conversions: acc.conversions + e.metrics.conversions,
        revenue: acc.revenue + e.metrics.revenue,
      }),
      { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
    );
    return buildMetrics(sums);
  }
}
