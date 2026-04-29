import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdConfigService } from './ad-config.service';
import { findScopedAdListings } from '../adapter/out/prisma/ad-listing.query';
import {
  aggregateDailyAdRows,
  findAdTrendDailyRows,
  findCampaignRollups,
  findGradeBudgetTotals,
} from '../adapter/out/prisma/ad-campaign.query';
import {
  toAdCampaignSnapshot,
  toAdTrendsData,
} from '../mapper/ad-campaign.mapper';
import { periodToDays, type AdPeriod } from '../domain/ad-metrics';
import type {
  AdCampaignSnapshot,
  AdTrendsData,
} from '@kiditem/shared/advertising';

@Injectable()
export class AdCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adConfigService: AdConfigService,
  ) {
    void this.adConfigService; // injected so future config-aware filters land without DI churn
  }

  /**
   * Campaign-grain rollup from `ChannelAdTargetDailySnapshot.targetType='campaign'`
   * over the requested period. Listings outside the tenant scope (or
   * soft-deleted) are dropped via the listing read model.
   */
  async getCampaigns(
    period: AdPeriod,
    campaignName: string | undefined,
    companyId: string,
  ): Promise<AdCampaignSnapshot[]> {
    const rollups = await findCampaignRollups(this.prisma, companyId, period, campaignName);
    const rollupsWithListing = rollups.filter(
      (r): r is typeof r & { listingId: string } => r.listingId != null,
    );
    if (rollupsWithListing.length === 0) return [];

    const listingIds = Array.from(
      new Set(rollupsWithListing.map((r) => r.listingId)),
    );
    const listingMap = await findScopedAdListings(this.prisma, companyId, listingIds);

    return rollupsWithListing.flatMap((rollup) => {
      const listing = listingMap.get(rollup.listingId);
      if (!listing) return [];
      return [toAdCampaignSnapshot(rollup, listing, period)];
    });
  }

  /**
   * Daily ad trend from `ChannelListingDailySnapshot` aggregated by
   * `businessDate` over the requested window. ABC grade budget is computed
   * by joining each daily row to its listing's master grade.
   */
  async getTrends(
    period: AdPeriod,
    days: number | undefined,
    companyId: string,
  ): Promise<AdTrendsData> {
    const dayCount = period ? periodToDays(period) : Math.min(days ?? 14, 90);
    const rows = await findAdTrendDailyRows(this.prisma, companyId, dayCount);
    const dailyAggregates = aggregateDailyAdRows(rows);
    const gradeBudget = await findGradeBudgetTotals(this.prisma, companyId, rows);
    return toAdTrendsData({ dailyAggregates, gradeBudget });
  }
}
