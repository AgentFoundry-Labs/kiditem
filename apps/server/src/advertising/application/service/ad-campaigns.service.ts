import { Inject, Injectable } from '@nestjs/common';
import type {
  AdCampaignSnapshot,
  AdProductSnapshot,
  AdTrendsData,
} from '@kiditem/shared/advertising';
import { AdConfigService } from './ad-config.service';
import { aggregateDailyAdRows } from '../../domain/ad-trend';
import {
  toAdCampaignSnapshot,
  toAdProductSnapshot,
  toAdTrendsData,
} from '../../mapper/ad-campaign.mapper';
import { periodToDays, type AdPeriod } from '../../domain/ad-metrics';
import {
  AD_CAMPAIGN_REPOSITORY_PORT,
  type AdCampaignRepositoryPort,
} from '../port/out/repository/ad-campaign.repository.port';
import {
  AD_LISTING_REPOSITORY_PORT,
  type AdListingRepositoryPort,
} from '../port/out/repository/ad-listing.repository.port';
import {
  AD_ACCOUNT_KPI_REPOSITORY_PORT,
  type AdAccountKpiRepositoryPort,
} from '../port/out/repository/ad-account-kpi.repository.port';

@Injectable()
export class AdCampaignsService {
  constructor(
    @Inject(AD_CAMPAIGN_REPOSITORY_PORT)
    private readonly campaignRepo: AdCampaignRepositoryPort,
    @Inject(AD_LISTING_REPOSITORY_PORT)
    private readonly listingRepo: AdListingRepositoryPort,
    @Inject(AD_ACCOUNT_KPI_REPOSITORY_PORT)
    private readonly accountKpiRepo: AdAccountKpiRepositoryPort,
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
    const rollups = await this.campaignRepo.findCampaignRollups(
      organizationId,
      period,
      campaignName,
    );
    if (rollups.length === 0) return [];

    const listingIds = Array.from(
      new Set(
        rollups
          .map((r) => r.listingId)
          .filter((id): id is string => id != null),
      ),
    );
    const listingMap =
      listingIds.length > 0
        ? await this.listingRepo.findScopedAdListings(
            organizationId,
            listingIds,
          )
        : new Map();

    return rollups.map((rollup) => {
      const listing = rollup.listingId
        ? listingMap.get(rollup.listingId) ?? null
        : null;
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
    const rollups = await this.campaignRepo.findProductTargetRollups(
      organizationId,
      period,
    );
    if (rollups.length === 0) return [];

    const listingIds = Array.from(
      new Set(
        rollups
          .map((r) => r.listingId)
          .filter((id): id is string => id != null),
      ),
    );
    const listingMap =
      listingIds.length > 0
        ? await this.listingRepo.findScopedAdListings(
            organizationId,
            listingIds,
          )
        : new Map();

    return rollups.map((rollup) => {
      const listing = rollup.listingId
        ? listingMap.get(rollup.listingId) ?? null
        : null;
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
      this.campaignRepo.findAdTrendDailyRows(organizationId, dayCount),
      this.accountKpiRepo.findCoupangAdsDaily(organizationId, period ?? '14d'),
    ]);
    const dailyAggregates = aggregateDailyAdRows(rows);
    const gradeBudget = await this.campaignRepo.findGradeBudgetTotals(
      organizationId,
      rows,
    );
    return toAdTrendsData({ dailyAggregates, gradeBudget, accountKpiRows });
  }
}
