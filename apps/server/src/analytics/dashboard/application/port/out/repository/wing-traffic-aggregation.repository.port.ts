// Outgoing port for Drive replay aggregations — Wing daily traffic +
// Coupang ads daily KPIs. The dashboard falls back onto these sources
// when the order-based revenue/ad math is zero. Also exposes the latest
// data date used to anchor the effective month.

export const WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT = Symbol(
  'WingTrafficAggregationRepositoryPort',
);

export interface WingTrafficMetrics {
  revenue: number;
  orders: number;
  salesQty: number;
  visitors: number;
  views: number;
  cartAdds: number;
  conversionRate: number;
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
  hasData: boolean;
  lastObservedAt: Date | null;
}

export interface WingDailyTrendRow {
  date: string;
  revenue: number;
  orders: number;
  salesQty: number;
  visitors: number;
}

export interface CoupangAdsDailyRow {
  date: string;
  ad_cost: number;
  ad_revenue: number;
  clicks: number;
  impressions: number;
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
