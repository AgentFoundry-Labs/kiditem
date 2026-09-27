import { Inject, Injectable } from '@nestjs/common';
import {
  campaignIdOfIdentity,
  keywordMetrics,
  toAdCampaignSnapshot,
  toAdKeywordSnapshot,
  toAdProductSnapshot,
  toAdTrendsData,
} from '../../domain/ad-campaign.mapper';
import {
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
  type ScopedAdListingReadModel,
} from '../port/out/repository/ad-listing.repository.port';
import {
  AD_ACTION_REPOSITORY_PORT,
  type AdActionRepositoryPort,
} from '../port/out/repository/ad-action.repository.port';
import type { AdCampaignSelector } from '../port/out/repository/ad-ledger-read.repository.port';
import { AdConfigService } from './ad-config.service';
import type {
  AdCampaignSnapshot,
  AdKeywordProductSummary,
  AdKeywordSnapshot,
  AdKeywordsData,
  AdProductSnapshot,
  AdTrendsData,
} from '@kiditem/shared/advertising';
import { businessDateKey, evidenceCutoffDate } from '../../../common/kst';

/** The campaign the ad-ops screens name: account plus `campaign:<id>` identity. */
export type AdCampaignIdentitySelector = { channelAccountId: string; campaignIdentity: string };

@Injectable()
export class AdCampaignsService {
  constructor(
    @Inject(AD_CAMPAIGN_REPOSITORY_PORT)
    private readonly campaignRepo: AdCampaignRepositoryPort,
    @Inject(AD_LISTING_REPOSITORY_PORT)
    private readonly listingRepo: AdListingRepositoryPort,
    @Inject(AD_ACTION_REPOSITORY_PORT)
    private readonly actionRepo: AdActionRepositoryPort,
    private readonly adConfigService: AdConfigService,
  ) {
    void this.adConfigService; // injected so future config-aware filters land without DI churn
  }

  /**
   * Current campaigns (`ChannelAdCampaign`, deleted ones excluded) with the
   * period's measured report sums (KID-372). A campaign without rows on a
   * measured period spent 0; a period with no measured day publishes
   * `metricsAvailable: false`. A campaign that advertised exactly one listing
   * carries it; listings hidden by tenant scope downgrade to `listing: null`.
   */
  async getCampaigns(
    period: AdPeriod,
    organizationId: string,
  ): Promise<AdCampaignSnapshot[]> {
    const { measuredDayCount, rows } = await this.campaignRepo.findCampaignRollups(organizationId, period);
    const listingMap = await this.scopedListings(
      organizationId,
      rows.flatMap((row) => (row.listingIds.length === 1 ? [row.listingIds[0]] : [])),
    );
    return rows.map((row) =>
      toAdCampaignSnapshot(
        row,
        row.listingIds.length === 1 ? listingMap.get(row.listingIds[0]) ?? null : null,
        period,
        measuredDayCount > 0,
      ));
  }

  /**
   * Advertised products (campaign × ad group × option) over the period's
   * measured days. Account plus campaign identity narrows to one campaign.
   */
  async getProducts(
    period: AdPeriod,
    organizationId: string,
    campaign?: AdCampaignIdentitySelector,
  ): Promise<AdProductSnapshot[]> {
    const selector = toCampaignSelector(campaign);
    if (selector === null) return [];
    const { rows } = await this.campaignRepo.findProductRollups(organizationId, period, selector);
    if (rows.length === 0) return [];
    const listingMap = await this.scopedListings(organizationId, rows.map((row) => row.listingId));
    return rows.map((row) =>
      toAdProductSnapshot(row, row.listingId ? listingMap.get(row.listingId) ?? null : null, period));
  }

  /**
   * Keyword rows summed over the chosen period's measured days (KID-372; the
   * keyword report is daily, so the period is honoured), plus the per-product
   * rollup the keyword view reads. The non-search row (`keyword ''`) of an
   * option is published as its own row and left out of keyword counts.
   */
  async getKeywords(
    period: AdPeriod,
    organizationId: string,
    campaign?: AdCampaignIdentitySelector,
  ): Promise<AdKeywordsData> {
    const selector = toCampaignSelector(campaign);
    const [result, pauseProposals] = await Promise.all([
      selector === null
        ? Promise.resolve({ measuredDayCount: 0, observedAt: null, rows: [] })
        : this.campaignRepo.findKeywordRollups(organizationId, period, selector),
      this.actionRepo.findKeywordPauseProposals(organizationId),
    ]);
    // A keyword's latest `pause_keyword` proposal, unless it was rejected, is
    // the agent's verdict, which the operator reviews here whatever its
    // execution state. Keyed by keyword text plus the advertised option so the
    // same keyword on another product is not marked by proxy.
    const proposalByKey = new Map(
      pauseProposals.map((proposal) => [
        `${proposal.externalId ?? ''}::${proposal.targetLabel}`,
        proposal,
      ]),
    );
    const listingMap = await this.scopedListings(organizationId, result.rows.map((row) => row.listingId));
    const keywords = result.rows.map((row) =>
      toAdKeywordSnapshot(
        row,
        row.listingId ? listingMap.get(row.listingId) ?? null : null,
        row.nonSearch ? null : proposalByKey.get(`${row.vendorItemId}::${row.keyword}`) ?? null,
        period,
      ));

    return {
      period,
      windowDays: result.measuredDayCount,
      collectedAt: result.observedAt ? result.observedAt.toISOString() : null,
      products: rollUpKeywordsByProduct(keywords),
      keywords,
    } satisfies AdKeywordsData;
  }

  private async scopedListings(
    organizationId: string,
    ids: ReadonlyArray<string | null>,
  ): Promise<Map<string, ScopedAdListingReadModel>> {
    const listingIds = [...new Set(ids.filter((id): id is string => id != null))];
    return listingIds.length > 0
      ? this.listingRepo.findScopedAdListings(organizationId, listingIds)
      : new Map();
  }

  /**
   * The ad-ops trend chart and KPI cards: organization totals per measured
   * business date (KID-372), for the requested inclusive range. Every
   * requested date is published; one no ad report measured is a hole, and the
   * summary carries the measured-day count.
   */
  async getTrends(
    period: AdPeriod,
    days: number | undefined,
    organizationId: string,
    dateRange?: { from: Date; to: Date },
  ): Promise<AdTrendsData> {
    void days; // backwards-compatible query field; period/dateRange own the window
    const range = dateRange ?? periodBounds(period);
    const window = await this.campaignRepo.findAdWindowDays(organizationId, range);
    return toAdTrendsData({
      knownThrough: businessDateKey(evidenceCutoffDate()),
      from: range.from,
      to: range.to,
      days: window.days,
      observedAt: window.observedAt,
    });
  }
}

/**
 * The ledger selector of a screen campaign identity. `undefined` reads every
 * campaign; `null` is an identity this ledger never issued, which names no rows.
 */
function toCampaignSelector(campaign?: AdCampaignIdentitySelector): AdCampaignSelector | undefined | null {
  if (!campaign) return undefined;
  const campaignId = campaignIdOfIdentity(campaign.campaignIdentity);
  return campaignId === null ? null : { channelAccountId: campaign.channelAccountId, campaignId };
}

/**
 * Group keyword rows into the per-product footprint the keyword view shows:
 * how many search keywords a product ran in the period, how many served, and
 * how many the agent flagged. Metrics include the non-search row; the counts
 * do not.
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
    const search = rows.filter((row) => !row.nonSearch);
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
      keywordCount: search.length,
      servingCount: search.filter((row) => row.metrics.impressions > 0).length,
      irrelevantCount: search.filter((row) => row.relevance === 'irrelevant').length,
      unjudgedCount: search.filter((row) => row.relevance === null).length,
      metrics: keywordMetrics(totals),
    } satisfies AdKeywordProductSummary;
  });

  return summaries.sort(
    (a, b) =>
      b.metrics.spend - a.metrics.spend ||
      b.keywordCount - a.keywordCount ||
      a.externalOptionId.localeCompare(b.externalOptionId),
  );
}
