import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdConfigService } from './ad-config.service';
import { findScopedAdListings } from '../../adapter/out/prisma/ad-listing.query';
import {
  aggregateDailyAdRows,
  findAdTrendDailyRows,
  findCampaignRollups,
  findGradeBudgetTotals,
  findProductTargetRollups,
} from '../../adapter/out/prisma/ad-campaign.query';
import { findCoupangAdsDailyAccountKpi } from '../../adapter/out/prisma/ad-account-kpi.query';
import {
  toAdCampaignSnapshot,
  toAdProductSnapshot,
  toAdTrendsData,
} from '../../mapper/ad-campaign.mapper';
import { periodToDays, type AdPeriod } from '../../domain/ad-metrics';
import type {
  AdCampaignSnapshot,
  AdProductSnapshot,
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
   * over the requested period. Rollups without a `listingId` (campaigns that
   * span many products — the typical Coupang case) surface with `listing: null`
   * so operators see real campaign performance instead of an empty list.
   * Listings hidden by tenant scope (or soft-deleted) downgrade to a
   * `listing: null` row instead of leaking the unscoped reference.
   */
  async getCampaigns(
    period: AdPeriod,
    campaignName: string | undefined,
    organizationId: string,
  ): Promise<AdCampaignSnapshot[]> {
    const rollups = await findCampaignRollups(this.prisma, organizationId, period, campaignName);
    if (rollups.length === 0) return [];

    const listingIds = Array.from(
      new Set(
        rollups
          .map((r) => r.listingId)
          .filter((id): id is string => id != null),
      ),
    );
    const listingMap = listingIds.length > 0
      ? await findScopedAdListings(this.prisma, organizationId, listingIds)
      : new Map();

    return rollups.map((rollup) => {
      const listing = rollup.listingId ? listingMap.get(rollup.listingId) ?? null : null;
      return toAdCampaignSnapshot(rollup, listing, period);
    });
  }

  /**
   * Product-grain ad rows from normalized target daily facts. Raw
   * `ChannelScrapeSnapshot` rows stay audit/replay evidence; the UI reads
   * this fact projection instead.
   */
  async getProducts(
    period: AdPeriod,
    organizationId: string,
  ): Promise<AdProductSnapshot[]> {
    const rollups = await findProductTargetRollups(this.prisma, organizationId, period);
    if (rollups.length === 0) return [];

    const listingIds = Array.from(
      new Set(
        rollups
          .map((r) => r.listingId)
          .filter((id): id is string => id != null),
      ),
    );
    const listingMap = listingIds.length > 0
      ? await findScopedAdListings(this.prisma, organizationId, listingIds)
      : new Map();

    return rollups.map((rollup) => {
      const listing = rollup.listingId ? listingMap.get(rollup.listingId) ?? null : null;
      return toAdProductSnapshot(rollup, listing, period);
    });
  }

  /**
   * Daily ad trend from `ChannelListingDailySnapshot` aggregated by
   * `businessDate` over the requested window. ABC grade budget is computed
   * by joining each daily row to its listing's master grade.
   *
   * Account-level `coupang_ads_daily` rows are also fetched so the response
   * carries the real Coupang ad dashboard surface alongside the per-listing
   * series. The mapper substitutes the account series into the primary
   * `daily` chart when per-listing ad metrics are empty (the Drive replay
   * shape — campaign source is not listing-attributed).
   */
  async getTrends(
    period: AdPeriod,
    days: number | undefined,
    organizationId: string,
  ): Promise<AdTrendsData> {
    const dayCount = period ? periodToDays(period) : Math.min(days ?? 14, 90);
    const [rows, accountKpiRows] = await Promise.all([
      findAdTrendDailyRows(this.prisma, organizationId, dayCount),
      findCoupangAdsDailyAccountKpi(this.prisma, organizationId, period ?? '14d'),
    ]);
    const dailyAggregates = aggregateDailyAdRows(rows);
    const gradeBudget = await findGradeBudgetTotals(this.prisma, organizationId, rows);
    return toAdTrendsData({ dailyAggregates, gradeBudget, accountKpiRows });
  }
}
