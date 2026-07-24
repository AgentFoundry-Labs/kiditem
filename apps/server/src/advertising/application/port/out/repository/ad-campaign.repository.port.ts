// Outgoing port for campaign / product target / trend reads off
// `ChannelAdTargetDailySnapshot` and `ChannelListingDailySnapshot`. Returns
// additive sums so the domain layer recomputes ratios.

import type { AdMetricSums, AdPeriod } from '../../../../domain/ad-metrics';

export const AD_CAMPAIGN_REPOSITORY_PORT = Symbol('AdCampaignRepositoryPort');

export interface CampaignRollup {
  targetKey: string;
  channelAccountId: string;
  campaignIdentity: string;
  campaignId: string | null;
  campaignName: string | null;
  listingId: string | null;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  orders: number;
  /**
   * Whether any contributing row actually observed a conversion-count column.
   *
   * The Coupang campaign dashboard grid has no conversion-count column at all
   * — its headers are `집행 광고비 / 중요 결과 광고 전환 매출 / 노출수 /
   * 클릭수 / 클릭률 / 전환율 / 광고수익률`. Only the per-campaign product
   * detail grid carries `광고 전환 판매수`. The scraper still emits a numeric
   * zero for absent columns, so a campaign-grain `conversions = 0` means "not
   * collected", not "zero conversions". Callers must render that as unknown
   * instead of a hard 0.
   */
  conversionsObserved: boolean;
}

export interface CampaignCurrentState {
  channelAccountId: string;
  campaignIdentity: string;
  campaignId: string | null;
  campaignName: string | null;
  status: string | null;
  onOff: string | null;
}

/**
 * Latest server-observed browser sweep for one channel account.
 *
 * `rosterComplete` is true only when the producer emitted an explicit
 * identity-complete terminal marker and the persisted distinct stable
 * identities exactly match its campaign count. Callers must ignore
 * `campaigns` when it is false.
 */
export interface CampaignCurrentSweep {
  channelAccountId: string;
  collectionRunId: string;
  collectionAttempt: number;
  completedAt: Date;
  campaignDailyCollectionComplete: boolean;
  campaignDailyWindowDays: number | null;
  campaignDailyFrom: string | null;
  campaignDailyTo: string | null;
  rosterComplete: boolean;
  campaigns: CampaignCurrentState[];
}

/**
 * Completion evidence for the exact Coupang account selected by account-less
 * browser ad ingest.
 *
 * `dailyFactsComplete` is repository-proven evidence: every campaign that
 * emitted an authoritative detail report has one persisted fact for every day
 * in the marker window, linked back to a successful scrape run from the same
 * collection run + attempt. Explicit metadata-only campaigns are roster
 * evidence and are intentionally excluded from the daily-fact requirement.
 */
export interface CampaignSyncSweepEvidence extends CampaignCurrentSweep {
  dailyFactsComplete: boolean;
}

export interface ProductTargetRollup {
  targetKey: string;
  channelAccountId: string;
  campaignIdentity: string | null;
  campaignId: string | null;
  campaignName: string | null;
  listingId: string | null;
  listingOptionId: string | null;
  externalId: string | null;
  externalOptionId: string | null;
  keyword: string | null;
  status: string | null;
  onOff: string | null;
  metaJson: unknown | null;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  orders: number;
}

export interface AdTrendDailyRow {
  businessDate: Date;
  adSpend: number;
  adRevenue: number;
  adClicks: number;
  adImpressions: number;
  adConversions: number;
  listingId: string | null;
}

export interface AdTrendDailyAggregate {
  date: string;
  sums: AdMetricSums;
}

export interface AdCampaignRepositoryPort {
  /** Campaign-grain rollup keyed by `(channelAccountId, campaignIdentity)`. */
  findCampaignRollups(
    organizationId: string,
    period: AdPeriod,
  ): Promise<CampaignRollup[]>;

  /**
   * Account-scoped current campaign roster from the latest completed,
   * identity-complete browser sweep. This is state evidence, not performance
   * data, and therefore does not fabricate dated metrics for OFF campaigns.
   */
  findLatestCompleteCampaignSweeps(
    organizationId: string,
  ): Promise<CampaignCurrentSweep[]>;

  /**
   * Latest sweep for the deterministic account used when the extension omits
   * `channelAccountId` (active primary first, then updatedAt/id fallback).
   */
  findAccountlessSyncCampaignSweep(
    organizationId: string,
  ): Promise<CampaignSyncSweepEvidence | null>;

  /**
   * Product-grain rollup. `targetType='product'` with product identity.
   * The composite campaign selector narrows to one campaign's member products;
   * campaign rollup rows never leak in.
   */
  findProductTargetRollups(
    organizationId: string,
    period: AdPeriod,
    campaign?: {
      channelAccountId: string;
      campaignIdentity: string;
    },
  ): Promise<ProductTargetRollup[]>;

  /** Raw per-(listing, businessDate) rows for an inclusive trend range. */
  findAdTrendDailyRows(
    organizationId: string,
    dateRange: { from: Date; to: Date },
  ): Promise<AdTrendDailyRow[]>;

  /**
   * ABC-grade budget totals computed from a set of daily rows.
   * Listings outside tenant scope contribute 0.
   */
  findGradeBudgetTotals(
    organizationId: string,
    rows: AdTrendDailyRow[],
  ): Promise<Record<'A' | 'B' | 'C', number>>;
}
