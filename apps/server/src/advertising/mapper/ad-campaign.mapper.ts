import { buildAdMetrics } from '../domain/ad-metrics';
import { normalizeAdKeywordOrigin } from '../domain/ad-keyword';
import { scopedListingToSummary } from './ad-listing.mapper';
import { businessDateKey, datesInclusive } from '../../common/kst';
import type {
  AdCampaignSnapshot,
  AdKeywordSnapshot,
  AdMeasuredMetrics,
  AdProductSnapshot,
  AdTrendsData,
  AdTrendsDay,
  AdTrendsSummary,
} from '@kiditem/shared/advertising';
import type { AdPeriod } from '../domain/ad-metrics';
import type { ScopedAdListingReadModel } from '../application/port/out/repository/ad-listing.repository.port';
import type { KeywordPauseProposalRow } from '../application/port/out/repository/ad-action.repository.port';
import type {
  AdTrendWindowDay,
  CampaignCurrentState,
  CampaignRollup,
  KeywordTargetRollup,
  ProductTargetRollup,
} from '../application/port/out/repository/ad-campaign.repository.port';

/**
 * CampaignRollup row → AdCampaignSnapshot. Campaign-grain rollups in
 * `ChannelAdTargetDailySnapshot` are not always tied to a single listing
 * (Coupang campaigns frequently span many products), so `listing` can be
 * `null`. Listings hidden by tenant scope (or soft-deleted) also surface as
 * a `null` listing so the caller cannot leak unscoped rows even when a
 * stale `listing_id` survives on the rollup row.
 */
export function toAdCampaignSnapshot(
  rollup: CampaignRollup,
  listing: ScopedAdListingReadModel | null,
  period: AdPeriod,
  currentState: CampaignCurrentState | null = null,
): AdCampaignSnapshot {
  return {
    listing: listing ? scopedListingToSummary(listing) : null,
    channelAccountId: rollup.channelAccountId,
    campaignIdentity: rollup.campaignIdentity,
    campaignId: currentState?.campaignId ?? rollup.campaignId,
    campaignName: currentState?.campaignName ?? rollup.campaignName,
    metricsAvailable: true,
    status: currentState?.status ?? null,
    onOff: currentState?.onOff ?? null,
    period,
    // The Coupang campaign dashboard grid carries no conversion-count column,
    // so every campaign-grain row lands with `conversions = 0` whether or not
    // conversions happened. Surface that as "unknown" instead of a hard 0 —
    // the real per-product conversion counts live on the campaign detail grid.
    conversionsAvailable: rollup.conversionsObserved,
    metrics: buildAdMetrics({
      spend: rollup.spend,
      revenue: rollup.revenue,
      impressions: rollup.impressions,
      clicks: rollup.clicks,
      conversions: campaignConversionCount(rollup),
    }),
  } satisfies AdCampaignSnapshot;
}

/**
 * Current campaign descriptor without dated facts for the requested period.
 *
 * Shared `AdMetrics` remains structurally stable, while
 * `metricsAvailable=false` makes every numeric placeholder explicitly
 * unavailable to API consumers.
 */
export function toMetadataOnlyAdCampaignSnapshot(
  state: CampaignCurrentState,
  period: AdPeriod,
): AdCampaignSnapshot {
  return {
    listing: null,
    channelAccountId: state.channelAccountId,
    campaignIdentity: state.campaignIdentity,
    campaignId: state.campaignId,
    campaignName: state.campaignName,
    metricsAvailable: false,
    status: state.status,
    onOff: state.onOff,
    period,
    conversionsAvailable: false,
    metrics: buildAdMetrics({
      spend: 0,
      revenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    }),
  } satisfies AdCampaignSnapshot;
}

export function toAdProductSnapshot(
  rollup: ProductTargetRollup,
  listing: ScopedAdListingReadModel | null,
  period: AdPeriod,
): AdProductSnapshot {
  const productName =
    readTargetMetaString(rollup.metaJson, 'productName') ??
    listing?.channelName ??
    listing?.masterProduct.name ??
    null;
  return {
    listing: listing ? scopedListingToSummary(listing) : null,
    channelAccountId: rollup.channelAccountId,
    campaignIdentity: rollup.campaignIdentity,
    externalId: rollup.externalId,
    externalOptionId: rollup.externalOptionId,
    campaignId: rollup.campaignId,
    campaignName: rollup.campaignName,
    keyword: rollup.keyword,
    status: rollup.status,
    onOff: rollup.onOff,
    productName,
    imageUrl: readTargetMetaString(rollup.metaJson, 'imageUrl'),
    productUrl: readTargetMetaString(rollup.metaJson, 'productUrl'),
    saleType: readTargetMetaString(rollup.metaJson, 'saleType'),
    period,
    metrics: buildAdMetrics({
      spend: rollup.spend,
      revenue: rollup.revenue,
      impressions: rollup.impressions,
      clicks: rollup.clicks,
      conversions: campaignConversionCount(rollup),
    }),
  } satisfies AdProductSnapshot;
}

/**
 * A keyword row with the keyword's latest pause proposal that was not
 * rejected. That proposal is the agent's "irrelevant" verdict and carries its
 * reason; a keyword without one has no verdict.
 */
export function toAdKeywordSnapshot(
  rollup: KeywordTargetRollup,
  listing: ScopedAdListingReadModel | null,
  pauseProposal: KeywordPauseProposalRow | null = null,
): AdKeywordSnapshot {
  return {
    channelAccountId: rollup.channelAccountId,
    campaignIdentity: rollup.campaignIdentity,
    campaignId: rollup.campaignId,
    campaignName: rollup.campaignName,
    adGroup: rollup.adGroup,
    keyword: rollup.keyword,
    origin: normalizeAdKeywordOrigin(
      readTargetMetaString(rollup.metaJson, 'origin'),
    ),
    status: rollup.status,
    onOff: rollup.onOff,
    currentBid: rollup.currentBid,
    externalOptionId: rollup.externalOptionId,
    productName:
      readTargetMetaString(rollup.metaJson, 'productName') ??
      listing?.channelName ??
      listing?.masterProduct.name ??
      null,
    listing: listing ? scopedListingToSummary(listing) : null,
    period: '7d',
    windowDays: rollup.windowDays,
    businessDate: rollup.businessDate,
    // The keyword table can lack the conversion column; its stored 0 is then
    // no count, so the flag says so and CVR is unavailable.
    conversionsAvailable: rollup.conversionsObserved,
    metrics: keywordMetrics(rollup, rollup.conversionsObserved),
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

/**
 * Keyword metrics keep the shared `AdMetrics` shape. Keyword rows carry a real
 * order count from the provider keyword table, so the campaign-grain
 * revenue-as-conversions guard does not apply; an unobserved count publishes
 * no CVR.
 */
export function keywordMetrics(
  sums: { spend: number; revenue: number; impressions: number; clicks: number; conversions: number },
  conversionsObserved: boolean,
): AdKeywordSnapshot['metrics'] {
  const metrics = buildAdMetrics({
    spend: sums.spend,
    revenue: sums.revenue,
    impressions: sums.impressions,
    clicks: sums.clicks,
    conversions: sums.conversions,
  });
  return conversionsObserved ? metrics : { ...metrics, cvr: null };
}

function readTargetMetaString(metaJson: unknown, key: string): string | null {
  if (!isRecord(metaJson)) return null;
  // Older rows nest descriptors under their namespace. Since #493 ingest
  // writes `{ source, data }`, which the ledger reader reads as well.
  for (const source of [
    'advertising.raw.target',
    'advertising.campaign.target',
    'advertising.keyword.target',
    'data',
  ]) {
    const data = metaJson[source];
    if (!isRecord(data)) continue;
    const value = data[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function campaignConversionCount(
  rollup: Pick<CampaignRollup, 'orders' | 'conversions' | 'revenue'>,
): number {
  if (rollup.orders > 0) return rollup.orders;
  // Older Coupang campaign scraper payloads could map "광고 전환 매출" into
  // `conversions` when an order-count column was absent. That value is revenue
  // in KRW, not a conversion count, so surfacing it creates impossible CVR.
  if (rollup.revenue > 0 && rollup.conversions === rollup.revenue) return 0;
  return rollup.conversions;
}

/**
 * Measured account days → the ad-ops trend and KPI summary.
 *
 * Every requested business date is present. A date the campaign sweep never
 * measured is `metrics: null` (a hole, not zero); a measured date without
 * advertising is all zeros with unavailable ratios. Conversion counts are
 * `null` when a summed row's provider grid carried no conversion column, and
 * the summary's counts are `null` unless every measured day observed them.
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
    return {
      date,
      metrics: measuredMetrics(day, day.conversionsObserved),
      orders: day.conversionsObserved ? day.orders : null,
    };
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
      conversions: acc.conversions + day.conversions,
      orders: acc.orders + day.orders,
    }),
    { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0, orders: 0 },
  );
  const conversionsObserved = measured.every((day) => day.conversionsObserved);
  return {
    periodDayCount: measured.length,
    latestBusinessDate: measured[measured.length - 1].businessDate,
    observedAt: observedAt?.toISOString() ?? null,
    metrics: measuredMetrics(totals, conversionsObserved),
    orders: conversionsObserved ? totals.orders : null,
  } satisfies AdTrendsSummary;
}

function measuredMetrics(
  sums: { spend: number; revenue: number; impressions: number; clicks: number; conversions: number },
  conversionsObserved: boolean,
): AdMeasuredMetrics {
  const metrics = buildAdMetrics(sums);
  return conversionsObserved
    ? metrics
    : { ...metrics, conversions: null, cvr: null };
}
