// Outgoing port for the trend chart raw SQL series. Per-day revenue from
// orders/line items and per-day ad spend from listing daily facts. Both
// reads bind the tenant predicate via Prisma tagged templates.

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
  ): Promise<TrendRevenueRow[]>;

  fetchTrendAdCostRows(
    organizationId: string,
    since: Date,
  ): Promise<TrendAdCostRow[]>;
}
