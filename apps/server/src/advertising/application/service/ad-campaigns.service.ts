import { Inject, Injectable } from '@nestjs/common';
import type {
  AdCampaignSyncStatus,
  AdCampaignSnapshot,
  AdKeywordProductSummary,
  AdKeywordSnapshot,
  AdKeywordsData,
  AdProductSnapshot,
  AdTrendsData,
} from '@kiditem/shared/advertising';
import { kstBusinessDate } from '../../../common/kst';
import { AdConfigService } from './ad-config.service';
import { aggregateDailyAdRows } from '../../domain/ad-trend';
import {
  toAdCampaignSnapshot,
  toMetadataOnlyAdCampaignSnapshot,
  toAdKeywordSnapshot,
  toAdProductSnapshot,
  toAdTrendsData,
} from '../../mapper/ad-campaign.mapper';
import {
  buildAdMetrics,
  periodBounds,
  type AdPeriod,
} from '../../domain/ad-metrics';
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
import {
  AD_ACTION_REPOSITORY_PORT,
  type AdActionRepositoryPort,
} from '../port/out/repository/ad-action.repository.port';

@Injectable()
export class AdCampaignsService {
  constructor(
    @Inject(AD_CAMPAIGN_REPOSITORY_PORT)
    private readonly campaignRepo: AdCampaignRepositoryPort,
    @Inject(AD_LISTING_REPOSITORY_PORT)
    private readonly listingRepo: AdListingRepositoryPort,
    @Inject(AD_ACCOUNT_KPI_REPOSITORY_PORT)
    private readonly accountKpiRepo: AdAccountKpiRepositoryPort,
    @Inject(AD_ACTION_REPOSITORY_PORT)
    private readonly actionRepo: AdActionRepositoryPort,
    private readonly adConfigService: AdConfigService,
  ) {
    void this.adConfigService; // injected so future config-aware filters land without DI churn
  }

  /**
   * Durable completion/freshness for the browser campaign + product sweep.
   *
   * A local browser session saying "succeeded" is deliberately insufficient:
   * the repository validates the latest persisted terminal marker against the
   * exact stable campaign identities observed in the same run + attempt.
   */
  async getCampaignSyncStatus(
    organizationId: string,
  ): Promise<AdCampaignSyncStatus> {
    const latest =
      await this.campaignRepo.findAccountlessSyncCampaignSweep(organizationId);
    if (!latest) {
      return {
        status: 'missing',
        lastCompletedAt: null,
        campaignCount: 0,
      } satisfies AdCampaignSyncStatus;
    }

    if (!latest.rosterComplete) {
      return {
        status: 'incomplete',
        lastCompletedAt: null,
        campaignCount: 0,
      } satisfies AdCampaignSyncStatus;
    }

    const latestCompleteBusinessDate = new Date(
      kstBusinessDate(new Date()).getTime() - 86_400_000,
    );
    const expectedDailyTo = latestCompleteBusinessDate
      .toISOString()
      .slice(0, 10);
    const expectedDailyFrom = new Date(
      latestCompleteBusinessDate.getTime() - 30 * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    const hasCompleteDailyWindowContract =
      latest.campaignDailyCollectionComplete &&
      latest.campaignDailyWindowDays === 31 &&
      isExactThirtyOneDayWindow(
        latest.campaignDailyFrom,
        latest.campaignDailyTo,
      );
    if (hasCompleteDailyWindowContract && !latest.dailyFactsComplete) {
      return {
        status: 'incomplete',
        lastCompletedAt: null,
        campaignCount: latest.campaigns.length,
      } satisfies AdCampaignSyncStatus;
    }
    const hasLatestCompleteDailyWindow =
      hasCompleteDailyWindowContract &&
      latest.dailyFactsComplete &&
      latest.campaignDailyFrom === expectedDailyFrom &&
      latest.campaignDailyTo === expectedDailyTo;
    return {
      status: hasLatestCompleteDailyWindow ? 'fresh' : 'stale',
      lastCompletedAt:
        hasCompleteDailyWindowContract && latest.dailyFactsComplete
          ? latest.completedAt
          : null,
      campaignCount: latest.campaigns.length,
    } satisfies AdCampaignSyncStatus;
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
    organizationId: string,
  ): Promise<AdCampaignSnapshot[]> {
    const [rollups, currentSweeps] = await Promise.all([
      this.campaignRepo.findCampaignRollups(organizationId, period),
      this.campaignRepo.findLatestCompleteCampaignSweeps(organizationId),
    ]);
    const completeSweeps = new Map(
      currentSweeps
        .filter((sweep) => sweep.rosterComplete)
        .map((sweep) => [sweep.channelAccountId, sweep]),
    );
    const currentStateByKey = new Map(
      [...completeSweeps.values()].flatMap((sweep) =>
        sweep.campaigns.map((campaign) => [
          campaignProjectionKey(
            campaign.channelAccountId,
            campaign.campaignIdentity,
          ),
          campaign,
        ] as const),
      ),
    );
    // Once an account has an identity-complete terminal marker, its roster is
    // authoritative current state. Period facts for campaigns absent from the
    // roster are historical/deleted and must not masquerade as current rows.
    const currentRollups = rollups.filter((rollup) => {
      const currentSweep = completeSweeps.get(rollup.channelAccountId);
      return (
        !currentSweep ||
        currentStateByKey.has(
          campaignProjectionKey(
            rollup.channelAccountId,
            rollup.campaignIdentity,
          ),
        )
      );
    });
    if (currentRollups.length === 0 && currentStateByKey.size === 0) return [];

    const listingIds = Array.from(
      new Set(
        currentRollups
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

    const result = currentRollups.map((rollup) => {
      const listing = rollup.listingId
        ? listingMap.get(rollup.listingId) ?? null
        : null;
      const currentState =
        currentStateByKey.get(
          campaignProjectionKey(
            rollup.channelAccountId,
            rollup.campaignIdentity,
          ),
        ) ?? null;
      return toAdCampaignSnapshot(rollup, listing, period, currentState);
    });
    const factKeys = new Set(
      currentRollups.map((rollup) =>
        campaignProjectionKey(
          rollup.channelAccountId,
          rollup.campaignIdentity,
        ),
      ),
    );
    for (const [key, state] of currentStateByKey) {
      if (!factKeys.has(key)) {
        result.push(toMetadataOnlyAdCampaignSnapshot(state, period));
      }
    }
    return result;
  }

  /**
   * Product-grain ad rows from normalized target daily facts. Raw
   * `ChannelScrapeSnapshot` rows stay audit/replay evidence; the UI reads
   * this fact projection instead.
   *
   * Account plus stable campaign identity narrows to one campaign's member
   * products. The repository's product-grain filter keeps campaign rollup rows
   * out, so a campaign never lists itself as a product.
   */
  async getProducts(
    period: AdPeriod,
    organizationId: string,
    campaign?: {
      channelAccountId: string;
      campaignIdentity: string;
    },
  ): Promise<AdProductSnapshot[]> {
    const rollups = await this.campaignRepo.findProductTargetRollups(
      organizationId,
      period,
      campaign,
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
   * Keyword-grain ad rows plus the per-product rollup the ad-ops keyword view
   * reads.
   *
   * A keyword can serve several advertised options in one ad group. Those rows
   * lose their option link during ingest (they are no longer attributable to
   * one product), so they still appear in `keywords` but contribute to no
   * product summary — the product footprint must not claim a keyword it does
   * not exclusively own.
   */
  async getKeywords(
    period: AdPeriod,
    organizationId: string,
    campaign?: {
      channelAccountId: string;
      campaignIdentity: string;
    },
  ): Promise<AdKeywordsData> {
    const [rollups, openActions] = await Promise.all([
      this.campaignRepo.findKeywordTargetRollups(organizationId, period, campaign),
      this.actionRepo.findOpenKeywordRelevanceActions(organizationId),
    ]);
    if (rollups.length === 0) {
      return { period, collectedAt: null, products: [], keywords: [] };
    }
    // An open `pause_keyword` proposal is the agent's verdict awaiting
    // approval. Keyed by keyword text plus the advertised option so the same
    // keyword on another product is not marked by proxy.
    const relevanceByKey = new Map(
      openActions.map((action) => [
        `${action.externalId ?? ''}::${action.targetLabel}`,
        action.reason,
      ]),
    );

    const listingIds = Array.from(
      new Set(
        rollups
          .map((rollup) => rollup.listingId)
          .filter((id): id is string => id != null),
      ),
    );
    const listingMap =
      listingIds.length > 0
        ? await this.listingRepo.findScopedAdListings(organizationId, listingIds)
        : new Map();

    const keywords = rollups.map((rollup) => {
      const reason = relevanceByKey.get(
        `${rollup.externalOptionId ?? ''}::${rollup.keyword}`,
      );
      return toAdKeywordSnapshot(
        rollup,
        rollup.listingId ? listingMap.get(rollup.listingId) ?? null : null,
        period,
        reason
          ? { verdict: 'irrelevant', reason }
          : { verdict: null, reason: null },
      );
    });
    const collectedAt = rollups.reduce<Date | null>(
      (latest, rollup) =>
        !latest || rollup.lastObservedAt > latest ? rollup.lastObservedAt : latest,
      null,
    );

    return {
      period,
      collectedAt: collectedAt ? collectedAt.toISOString() : null,
      products: rollUpKeywordsByProduct(keywords),
      keywords,
    } satisfies AdKeywordsData;
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
    dateRange?: { from: Date; to: Date },
  ): Promise<AdTrendsData> {
    void days; // backwards-compatible query field; period/dateRange own the window
    const resolvedDateRange = dateRange ?? periodBounds(period);
    const [rows, accountKpiRows] = await Promise.all([
      this.campaignRepo.findAdTrendDailyRows(
        organizationId,
        resolvedDateRange,
      ),
      this.accountKpiRepo.findCoupangAdsDaily(
        organizationId,
        period,
        resolvedDateRange,
      ),
    ]);
    const dailyAggregates = aggregateDailyAdRows(rows);
    const gradeBudget = await this.campaignRepo.findGradeBudgetTotals(
      organizationId,
      rows,
    );
    return toAdTrendsData({ dailyAggregates, gradeBudget, accountKpiRows });
  }
}

function campaignProjectionKey(
  channelAccountId: string,
  campaignIdentity: string,
): string {
  return `${channelAccountId}\u001f${campaignIdentity}`;
}

function isExactThirtyOneDayWindow(
  from: string | null,
  to: string | null,
): boolean {
  if (!from || !to) return false;
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  return (
    Number.isFinite(fromDate.getTime()) &&
    Number.isFinite(toDate.getTime()) &&
    fromDate.toISOString().slice(0, 10) === from &&
    toDate.toISOString().slice(0, 10) === to &&
    (toDate.getTime() - fromDate.getTime()) / 86_400_000 + 1 === 31
  );
}

/**
 * Group keyword rows into the per-product footprint the keyword view shows:
 * how many keywords a product is running, how many of those Coupang matched on
 * its own, how many actually served, and how many the agent flagged.
 *
 * Only keywords that belong to exactly one advertised option are counted. A
 * keyword shared across options arrives with no option link (see
 * `AdKeywordIngestHandler`) and is deliberately excluded rather than being
 * attributed to an arbitrary product.
 */
function rollUpKeywordsByProduct(
  keywords: AdKeywordSnapshot[],
): AdKeywordProductSummary[] {
  const byOption = new Map<string, AdKeywordSnapshot[]>();
  for (const keyword of keywords) {
    if (!keyword.externalOptionId) continue;
    const bucket = byOption.get(keyword.externalOptionId);
    if (bucket) bucket.push(keyword);
    else byOption.set(keyword.externalOptionId, [keyword]);
  }

  const summaries = [...byOption.entries()].map(([externalOptionId, rows]) => {
    const head = rows[0];
    const totals = rows.reduce(
      (acc, row) => ({
        spend: acc.spend + row.metrics.spend,
        revenue: acc.revenue + row.metrics.revenue,
        impressions: acc.impressions + row.metrics.impressions,
        clicks: acc.clicks + row.metrics.clicks,
        conversions: acc.conversions + row.metrics.conversions,
      }),
      { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 },
    );
    return {
      externalOptionId,
      productName: rows.find((row) => row.productName)?.productName ?? null,
      campaignId: head.campaignId,
      campaignName: head.campaignName,
      listing: rows.find((row) => row.listing)?.listing ?? null,
      keywordCount: rows.length,
      registeredCount: rows.filter((row) => row.origin === 'registered').length,
      smartTargetingCount: rows.filter(
        (row) => row.origin === 'smart_targeting',
      ).length,
      servingCount: rows.filter((row) => row.metrics.impressions > 0).length,
      irrelevantCount: rows.filter((row) => row.relevance === 'irrelevant')
        .length,
      unjudgedCount: rows.filter((row) => row.relevance === null).length,
      metrics: buildAdMetrics(totals),
    } satisfies AdKeywordProductSummary;
  });

  return summaries.sort(
    (a, b) =>
      b.metrics.spend - a.metrics.spend ||
      b.keywordCount - a.keywordCount ||
      a.externalOptionId.localeCompare(b.externalOptionId),
  );
}
