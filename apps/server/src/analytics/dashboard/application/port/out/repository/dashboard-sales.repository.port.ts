// Sales projections composed from Orders' canonical reader plus listing and
// product identity/configuration reads.

import type { TopProduct } from '@kiditem/shared/dashboard';

export const DASHBOARD_SALES_REPOSITORY_PORT = Symbol(
  'DashboardSalesRepositoryPort',
);

export interface TodayKpiRow {
  revenue: number | null;
  orders: number | null;
  requestedDates: string[];
  includedDates: string[];
  missingDates: string[];
  observedAt: Date | null;
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

}
