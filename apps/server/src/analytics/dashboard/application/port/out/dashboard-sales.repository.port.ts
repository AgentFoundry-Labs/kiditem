// Outgoing port for sales-side raw SQL reads. Tagged-template `$queryRaw`
// reads hydrate the today KPI tile, the top-N product ranking, and the
// per-day revenue series. Tenant predicate is `${organizationId}::uuid`
// on every tenant-owned table (orders, listings, products).

import type { TopProduct, DailyRevenueItem } from '@kiditem/shared/dashboard';

export const DASHBOARD_SALES_REPOSITORY_PORT = Symbol(
  'DashboardSalesRepositoryPort',
);

export interface TodayKpiRow {
  revenue: number;
  orders: number;
}

export interface DashboardSalesRepositoryPort {
  fetchTodayKpis(
    organizationId: string,
    todayStart: Date,
    todayEnd: Date,
  ): Promise<TodayKpiRow>;

  fetchTopProducts(
    organizationId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<TopProduct[]>;

  fetchDailyRevenue(
    organizationId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<DailyRevenueItem[]>;
}
