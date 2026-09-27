// Outgoing port for the ad-ops campaign / product / keyword / trend tabs over
// the ad report ledger (KID-372). Returns additive sums of measured days so the
// domain layer recomputes ratios; spend is the delivered spend ("집행 광고비").

import type { AdPeriod } from '../../../../domain/ad-metrics';
import type {
  AdCampaignSelector,
  AdCampaignWindowRollup,
  AdKeywordWindowRollup,
  AdProductWindowRollup,
} from './ad-ledger-read.repository.port';

export const AD_CAMPAIGN_REPOSITORY_PORT = Symbol('AdCampaignRepositoryPort');

/** One measured business date of the organization's ad totals. */
export interface AdTrendWindowDay {
  businessDate: string;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  orders: number;
}

export interface AdTrendWindow {
  /** Measured dates only, ascending; an absent date was never measured. */
  days: readonly AdTrendWindowDay[];
  observedAt: Date | null;
}

/** Rows of one period plus how many of its days were measured. */
export interface AdPeriodRows<Row> {
  measuredDayCount: number;
  observedAt: Date | null;
  rows: readonly Row[];
}

export interface AdCampaignRepositoryPort {
  /** Current campaigns (`ChannelAdCampaign`) with the period's measured sums. */
  findCampaignRollups(organizationId: string, period: AdPeriod): Promise<AdPeriodRows<AdCampaignWindowRollup>>;

  /** Advertised products (campaign × ad group × option), optionally of one campaign. */
  findProductRollups(
    organizationId: string,
    period: AdPeriod,
    campaign?: AdCampaignSelector,
  ): Promise<AdPeriodRows<AdProductWindowRollup>>;

  /** Keyword rows summed over the period's measured days, optionally of one campaign. */
  findKeywordRollups(
    organizationId: string,
    period: AdPeriod,
    campaign?: AdCampaignSelector,
  ): Promise<AdPeriodRows<AdKeywordWindowRollup>>;

  /** Measured organization days for an inclusive business-date range. */
  findAdWindowDays(organizationId: string, dateRange: { from: Date; to: Date }): Promise<AdTrendWindow>;
}
