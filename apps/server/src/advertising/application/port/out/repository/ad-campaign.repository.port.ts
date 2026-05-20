// Outgoing port for campaign / product target / trend reads off
// `ChannelAdTargetDailySnapshot` and `ChannelListingDailySnapshot`. Returns
// additive sums so the domain layer recomputes ratios.

import type { AdMetricSums, AdPeriod } from '../../../../domain/ad-metrics';

export const AD_CAMPAIGN_REPOSITORY_PORT = Symbol('AdCampaignRepositoryPort');

export interface CampaignRollup {
  targetKey: string;
  campaignId: string | null;
  campaignName: string | null;
  listingId: string | null;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  orders: number;
}

export interface ProductTargetRollup {
  targetKey: string;
  campaignId: string | null;
  campaignName: string | null;
  listingId: string | null;
  listingOptionId: string | null;
  optionId: string | null;
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
  /** Campaign-grain rollup. `targetType='campaign'`. */
  findCampaignRollups(
    organizationId: string,
    period: AdPeriod,
    campaignName?: string,
  ): Promise<CampaignRollup[]>;

  /** Product-grain rollup. `targetType='product'`. */
  findProductTargetRollups(
    organizationId: string,
    period: AdPeriod,
  ): Promise<ProductTargetRollup[]>;

  /** Raw per-(listing, businessDate) rows for trend folding. */
  findAdTrendDailyRows(
    organizationId: string,
    days: number,
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
