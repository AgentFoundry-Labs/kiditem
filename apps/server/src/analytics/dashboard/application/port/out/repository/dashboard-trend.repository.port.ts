// Outgoing port for the trend chart raw SQL series. Per-day revenue comes
// from orders/line items; account ad KPIs are read through the Advertising
// owner port on the daily-traffic adapter. The raw repository keeps only the
// tenant-scoped order series and its legacy compatibility surface.

export const DASHBOARD_TREND_REPOSITORY_PORT = Symbol(
  'DashboardTrendRepositoryPort',
);

export interface TrendRevenueRow {
  date: string;
  revenue: number;
}

export interface TrendAdCostRow {
  date: string;
  ad_cost: number;
}

export interface DashboardTrendRepositoryPort {
  fetchTrendRevenueRows(
    organizationId: string,
    since: Date,
    until?: Date,
  ): Promise<TrendRevenueRow[]>;

  fetchTrendAdCostRows(
    organizationId: string,
    since: Date,
    until?: Date,
  ): Promise<TrendAdCostRow[]>;
}
