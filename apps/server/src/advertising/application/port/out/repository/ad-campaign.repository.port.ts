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

export interface ProductTargetRollup {
  targetKey: string;
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
  /**
   * Campaign-grain rollup, merged by campaign identity.
   *
   * One campaign accumulates several `target_key` values over time because the
   * identity scheme changed (legacy `product:<name>:<synthetic>`, the collapsed
   * `campaign:href:<dashboard list url>`, and the current
   * `account:<id>:campaign:name:<name>`). Grouping by `target_key` therefore
   * rendered the same campaign two or three times — once with real numbers and
   * again as an all-zero row. Merge on campaign identity instead.
   */
  findCampaignRollups(
    organizationId: string,
    period: AdPeriod,
    campaignName?: string,
  ): Promise<CampaignRollup[]>;

  /**
   * Product-grain rollup. `targetType='product'` with product identity.
   * `campaignName` narrows to one campaign's member products for the
   * per-campaign detail table; campaign rollup rows never leak in.
   */
  findProductTargetRollups(
    organizationId: string,
    period: AdPeriod,
    campaignName?: string,
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
