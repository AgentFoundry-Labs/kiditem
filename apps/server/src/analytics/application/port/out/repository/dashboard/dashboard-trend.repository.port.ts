// Per-day revenue projection from Orders' canonical facts. Complete-empty
// dates are emitted as zero; uncovered dates are absent.

export const DASHBOARD_TREND_REPOSITORY_PORT = Symbol(
  'DashboardTrendRepositoryPort',
);

export interface TrendRevenueRow {
  date: string;
  revenue: number;
}

export interface DashboardTrendRepositoryPort {
  fetchTrendRevenueRows(
    organizationId: string,
    since: Date,
    until: Date,
  ): Promise<TrendRevenueRow[]>;
}
