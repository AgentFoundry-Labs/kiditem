import { buildAdMetrics } from './ad-metrics';
import { scopedListingToSummary } from './ad-listing.mapper';
import { adConversions, performanceAdSpend } from './ad-spend-rule';
import { businessDateKey, datesInclusive } from '../../common/kst';
import type {
  AdCampaignSnapshot,
  AdKeywordSnapshot,
  AdMetrics,
  AdProductSnapshot,
  AdTrendsData,
  AdTrendsDay,
  AdTrendsSummary,
} from '@kiditem/shared/advertising';
import type { AdPeriod } from './ad-metrics';
import type { ScopedAdListingReadModel } from '../application/port/out/repository/ad-listing.repository.port';
import type { KeywordPauseProposalRow } from '../application/port/out/repository/ad-action.repository.port';
import type { AdTrendWindowDay } from '../application/port/out/repository/ad-campaign.repository.port';
import type {
  AdCampaignWindowRollup,
  AdKeywordWindowRollup,
  AdProductWindowRollup,
} from '../application/port/out/repository/ad-ledger-read.repository.port';

const CAMPAIGN_IDENTITY_PREFIX = 'campaign:';

/** The stable campaign identity the ad-ops screens round-trip: `campaign:<provider campaign id>`. */
export function adCampaignIdentity(campaignId: string): string {
  return `${CAMPAIGN_IDENTITY_PREFIX}${campaignId}`;
}

/** The provider campaign id of an identity from `adCampaignIdentity`, or null for any other shape. */
export function campaignIdOfIdentity(identity: string): string | null {
  if (!identity.startsWith(CAMPAIGN_IDENTITY_PREFIX)) return null;
  const campaignId = identity.slice(CAMPAIGN_IDENTITY_PREFIX.length).trim();
  return campaignId.length > 0 ? campaignId : null;
}

/** The ad center's ON/OFF word for an active flag; unknown stays null. */
function onOffWord(isActive: boolean | null): string | null {
  if (isActive === null) return null;
  return isActive ? 'ON' : 'OFF';
}

/**
 * Performance metrics of report sums: spend is the delivered spend ("집행 광고비",
 * `performanceAdSpend`), conversions are the report's orders.
 */
function performanceMetrics(sums: Readonly<{
  spend: number; revenue: number; impressions: number; clicks: number; orders: number;
}>): AdMetrics {
  return buildAdMetrics({
    spend: performanceAdSpend(sums.spend),
    revenue: sums.revenue,
    impressions: sums.impressions,
    clicks: sums.clicks,
    conversions: adConversions(sums),
  });
}

/**
 * A current campaign (`ChannelAdCampaign`) with its period sums. `listing` is set
 * only when the campaign advertised exactly one listing the caller could scope;
 * `metricsAvailable` is false when the period has no measured day.
 */
export function toAdCampaignSnapshot(
  rollup: AdCampaignWindowRollup,
  listing: ScopedAdListingReadModel | null,
  period: AdPeriod,
  metricsAvailable: boolean,
): AdCampaignSnapshot {
  return {
    listing: listing ? scopedListingToSummary(listing) : null,
    channelAccountId: rollup.channelAccountId,
    campaignIdentity: adCampaignIdentity(rollup.campaignId),
    campaignId: rollup.campaignId,
    campaignName: rollup.campaignName,
    metricsAvailable,
    status: rollup.status,
    onOff: onOffWord(rollup.isActive),
    isActive: rollup.isActive,
    budget: rollup.budget,
    roasTarget: rollup.roasTarget,
    period,
    metrics: performanceMetrics(rollup),
  } satisfies AdCampaignSnapshot;
}

/**
 * One advertised product (campaign × ad group × option). The Coupang listing
 * number comes from the scoped catalog listing. The report carries no product
 * link, image or sale type, so the snapshot has no product URL and publishes
 * `imageUrl`/`saleType` as null (KID-372).
 */
export function toAdProductSnapshot(
  rollup: AdProductWindowRollup,
  listing: ScopedAdListingReadModel | null,
  period: AdPeriod,
): AdProductSnapshot {
  return {
    listing: listing ? scopedListingToSummary(listing) : null,
    channelAccountId: rollup.channelAccountId,
    campaignIdentity: adCampaignIdentity(rollup.campaignId),
    externalId: listing?.externalId ?? null,
    externalOptionId: rollup.vendorItemId,
    campaignId: rollup.campaignId,
    campaignName: rollup.campaignName,
    keyword: null,
    status: rollup.status,
    onOff: onOffWord(rollup.isActive),
    productName: rollup.optionName ?? listing?.channelName ?? listing?.masterProduct.name ?? null,
    imageUrl: null,
    saleType: null,
    period,
    metrics: performanceMetrics(rollup),
  } satisfies AdProductSnapshot;
}

/**
 * A keyword row summed over the chosen period, with the keyword's latest pause
 * proposal, absent when that proposal was rejected. That proposal is the
 * agent's "irrelevant" verdict and carries its reason.
 */
export function toAdKeywordSnapshot(
  rollup: AdKeywordWindowRollup,
  listing: ScopedAdListingReadModel | null,
  pauseProposal: KeywordPauseProposalRow | null,
  period: AdPeriod,
): AdKeywordSnapshot {
  return {
    channelAccountId: rollup.channelAccountId,
    campaignIdentity: adCampaignIdentity(rollup.campaignId),
    campaignId: rollup.campaignId,
    campaignName: rollup.campaignName,
    adGroup: rollup.adGroupId,
    keyword: rollup.keyword,
    nonSearch: rollup.nonSearch,
    status: null,
    onOff: null,
    externalOptionId: rollup.vendorItemId,
    productName: rollup.optionName ?? listing?.channelName ?? listing?.masterProduct.name ?? null,
    listing: listing ? scopedListingToSummary(listing) : null,
    period,
    windowDays: rollup.days,
    businessDate: rollup.lastDate,
    metrics: performanceMetrics(rollup),
    relevance: pauseProposal ? 'irrelevant' : null,
    relevanceReason: pauseProposal?.reason ?? null,
    pauseProposal: pauseProposal
      ? {
          actionId: pauseProposal.actionId,
          approvalStatus: pauseProposal.approvalStatus,
          executeStatus: pauseProposal.executeStatus,
          errorMessage: pauseProposal.errorMessage,
        }
      : null,
  } satisfies AdKeywordSnapshot;
}

/** Summed keyword metrics of several keyword rows (the keyword view's product summary). */
export function keywordMetrics(sums: Readonly<{
  spend: number; revenue: number; impressions: number; clicks: number; conversions: number;
}>): AdMetrics {
  return buildAdMetrics(sums);
}

/**
 * Measured organization days → the ad-ops trend and KPI summary.
 *
 * Every requested business date is present. A date no ad report measured is
 * `metrics: null` (a hole, not zero); a measured date without advertising is
 * all zeros with unavailable ratios. Conversions are the report's orders.
 * Ratios recompute from the summed raw values.
 */
export function toAdTrendsData(input: {
  knownThrough: string;
  from: Date;
  to: Date;
  days: readonly AdTrendWindowDay[];
  observedAt: Date | null;
}): AdTrendsData {
  const byDate = new Map(input.days.map((day) => [day.businessDate, day]));
  const requested = datesInclusive(input.from, input.to).map(businessDateKey);
  const measured: AdTrendWindowDay[] = [];
  const daily = requested.map((date): AdTrendsDay => {
    const day = byDate.get(date);
    if (!day) return { date, metrics: null, orders: null };
    measured.push(day);
    return { date, metrics: performanceMetrics(day), orders: day.orders };
  });

  return {
    knownThrough: input.knownThrough,
    from: businessDateKey(input.from),
    to: businessDateKey(input.to),
    daily,
    summary: summarize(measured, input.observedAt),
  } satisfies AdTrendsData;
}

function summarize(
  measured: readonly AdTrendWindowDay[],
  observedAt: Date | null,
): AdTrendsSummary {
  if (measured.length === 0) {
    return {
      periodDayCount: 0,
      latestBusinessDate: null,
      observedAt: null,
      metrics: null,
      orders: null,
    } satisfies AdTrendsSummary;
  }
  const totals = measured.reduce(
    (acc, day) => ({
      spend: acc.spend + day.spend,
      revenue: acc.revenue + day.revenue,
      impressions: acc.impressions + day.impressions,
      clicks: acc.clicks + day.clicks,
      orders: acc.orders + day.orders,
    }),
    { spend: 0, revenue: 0, impressions: 0, clicks: 0, orders: 0 },
  );
  return {
    periodDayCount: measured.length,
    latestBusinessDate: measured[measured.length - 1].businessDate,
    observedAt: observedAt?.toISOString() ?? null,
    metrics: performanceMetrics(totals),
    orders: totals.orders,
  } satisfies AdTrendsSummary;
}
