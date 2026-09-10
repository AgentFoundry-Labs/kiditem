// Outgoing port for Drive replay aggregations — Wing daily traffic +
// Coupang ads daily KPIs. The dashboard falls back onto these sources
// when the order-based revenue/ad math is zero. Also exposes the latest
// data date used to anchor the effective month.

export const WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT = Symbol(
  'WingTrafficAggregationRepositoryPort',
);

export type TrafficAdditiveMetric =
  | 'views'
  | 'cartAdds'
  | 'orders'
  | 'salesQty'
  | 'revenue';

export type TrafficReconciliationStatus =
  | 'MATCHED'
  | 'MISMATCH'
  | 'UNVERIFIED';

export interface TrafficMetricReconciliation {
  status: TrafficReconciliationStatus;
  dailySum: number | null;
  periodValue: number | null;
}

export type TrafficReconciliation = Record<
  TrafficAdditiveMetric,
  TrafficMetricReconciliation
>;

export interface WingTrafficCoverage {
  from: string;
  to: string;
  targetDays: number;
  completedDays: number;
  missingDates: string[];
}

export type AdMetricSource =
  | 'coupang_ads'
  | 'listing'
  | 'orders'
  | 'unavailable';

export interface CoupangAdsCoverage {
  /** Exact selected KST range, inclusive. */
  from: string;
  to: string;
  /** Effective source cutoff; future preset dates are not expected. */
  knownThrough: string | null;
  targetDays: number;
  completedDays: number;
  missingDates: string[];
}

export interface WingTrafficMetrics {
  revenue: number;
  orders: number;
  salesQty: number;
  visitors: number;
  views: number;
  cartAdds: number;
  conversionRate: number;
  /** Average of account-level daily unique visitors; never an account UV sum. */
  dailyAverageVisitors?: number | null;
  /** Provider-reported conversion percentage, kept separate from our ratio. */
  providerConversionRate?: number | null;
  /** Owner attempt that supplied the selected account daily rows. */
  sourceAttemptId?: string | null;
  coverage?: WingTrafficCoverage | null;
  reconciliation?: TrafficReconciliation | null;
  /** Exact-period provider evidence, when the owner published it. */
  exactPeriodEvidence?: Record<string, unknown> | null;
  /** A traffic source was collected for the requested period, even if all metrics are zero. */
  isCollected: boolean;
  hasData: boolean;
  lastObservedAt: Date | null;
}

export interface CoupangAdsMetrics {
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  orders: number;
  /** Our report-defined CVR: observed orders / clicks. */
  conversionRate: number | null;
  /** Provider ratio, preserved separately and never used for our CVR. */
  providerConversionRate: number | null;
  coverage: CoupangAdsCoverage | null;
  /** At least one complete owner row exists, including explicit all-zero rows. */
  isCollected: boolean;
  /** The owner range is complete through its effective cutoff. */
  hasData: boolean;
  lastObservedAt: Date | null;
}

export interface WingDailyTrendRow {
  date: string;
  revenue: number;
  orders: number;
  salesQty: number;
  visitors: number;
  views: number;
  cartAdds: number;
  observedAt: string | null;
}

export interface CoupangAdsDailyRow {
  date: string;
  ad_cost: number;
  ad_revenue: number;
  clicks: number;
  impressions: number;
  conversions: number;
  orders: number;
  observedAt: string | null;
}

export interface WingTrafficAggregationRepositoryPort {
  aggregateTraffic(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<WingTrafficMetrics>;

  aggregateCoupangAds(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<CoupangAdsMetrics>;

  findLatestDataDate(organizationId: string): Promise<Date | null>;

  fetchDailyTrend(
    organizationId: string,
    since: Date,
    until?: Date,
  ): Promise<WingDailyTrendRow[]>;

  fetchDailyAds(
    organizationId: string,
    since: Date,
    until?: Date,
  ): Promise<CoupangAdsDailyRow[]>;
}
