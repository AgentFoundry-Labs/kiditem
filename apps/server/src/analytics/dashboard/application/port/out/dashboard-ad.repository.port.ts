// Outgoing port for the 30-day daily ad cost window read against
// `channel_listing_daily_snapshots`. KST-anchored on `business_date`.

export const DASHBOARD_AD_REPOSITORY_PORT = Symbol('DashboardAdRepositoryPort');

export interface DailyAdCostRow {
  date: string;
  ad_cost: number;
}

export interface DashboardAdRepositoryPort {
  fetchDailyAdCost(
    organizationId: string,
    fromBusinessDate: Date,
  ): Promise<DailyAdCostRow[]>;
}
