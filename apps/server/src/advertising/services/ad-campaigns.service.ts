import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdConfigService } from './ad-config.service';
import { LISTING_SUMMARY_SELECT } from './types';
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
    ctr:
      impressions > 0
        ? Math.round((clicks / impressions) * 10000) / 100
        : null,
    roas:
      spend > 0 ? Math.round((revenue / spend) * 10000) / 100 : null,
    cvr:
      clicks > 0 ? Math.round((conversions / clicks) * 10000) / 100 : null,
  };
}

function periodToDays(period: CampaignsPeriod, fallback = 14): number {
  if (period === '7d') return 7;
  if (period === 'month') {
    const now = new Date();
    return Math.max(now.getDate(), 1);
  }
  return fallback;
}

@Injectable()
export class AdCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adConfigService: AdConfigService,
  ) {}

  async getCampaigns(
    period: CampaignsPeriod,
    campaignName: string | undefined,
    companyId: string,
  ): Promise<AdCampaignSnapshot[]> {
    const snapshots = await this.prisma.adSnapshot.findMany({
      where: {
        companyId,
        level: 'campaign',
        period,
        listingId: { not: null },
        ...(campaignName ? { campaignName } : {}),
      },
      orderBy: [{ date: 'desc' }, { capturedAt: 'desc' }],
      include: {
        listing: {
          select: {
            ...LISTING_SUMMARY_SELECT,
          },
        },
      },
    });

    return snapshots.flatMap((snap) => {
      if (!snap.listing) return [];
      const listing: AdListingSummary = {
        listingId: snap.listing.id,
        externalId: snap.listing.externalId,
        channelName: snap.listing.channelName,
        masterProduct: {
          id: snap.listing.master.id,
          code: snap.listing.master.code,
          name: snap.listing.master.name,
        },
        option: null,
      };
      const metrics = buildMetrics({
        spend: snap.adSpend || snap.spend,
        impressions: snap.impressions,
        clicks: snap.clicks,
        conversions: snap.conversions,
        revenue: snap.adRevenue || snap.revenue,
      });
      return [
        {
          listing,
          campaignId: snap.externalId ?? null,
          campaignName: snap.campaignName ?? null,
          period: snap.period ?? period,
          metrics,
        } satisfies AdCampaignSnapshot,
      ];
    });
  }

  async getTrends(
    period: CampaignsPeriod,
    days: number | undefined,
    companyId: string,
  ): Promise<AdTrendsData> {
    const d = period ? periodToDays(period) : Math.min(days ?? 14, 90);
    const since = new Date();
    since.setDate(since.getDate() - d);
    since.setHours(0, 0, 0, 0);

    const ads = await this.prisma.ad.findMany({
      where: { companyId, date: { gte: since } },
      select: {
        date: true,
        spend: true,
        revenue: true,
        clicks: true,
        impressions: true,
        conversions: true,
        listing: {
          select: { master: { select: { abcGrade: true } } },
        },
      },
      orderBy: { date: 'asc' },
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

    for (const ad of ads) {
      const key = ad.date.toISOString().slice(0, 10);
      const prev = dayMap.get(key) ?? {
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
      };
      prev.spend += ad.spend;
      prev.impressions += ad.impressions;
      prev.clicks += ad.clicks;
      prev.conversions += ad.conversions;
      prev.revenue += ad.revenue;
      dayMap.set(key, prev);
    }

    const daily = [...dayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sums]) => ({ date, metrics: buildMetrics(sums) }));

    const mid = Math.floor(daily.length / 2);
    const firstHalf = this.aggregate(daily.slice(0, mid));
    const secondHalf = this.aggregate(daily.slice(mid));

    const gradeBudget: Record<'A' | 'B' | 'C', number> = { A: 0, B: 0, C: 0 };
    for (const ad of ads) {
      const grade = ad.listing?.master?.abcGrade;
      if (grade === 'A' || grade === 'B' || grade === 'C') {
        gradeBudget[grade] += ad.spend;
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
