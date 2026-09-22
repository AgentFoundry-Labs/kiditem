// Sales projections composed from Orders' canonical reader plus listing and
// product identity/configuration reads, and one calendar month's product
// ranking from Sellpia's per-product monthly sales.

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

/** One calendar month's Top products, read from Sellpia's product sales. */
export interface SellpiaTopProductsRead {
  products: TopProduct[];
  /** The business dates the month's Sellpia facts cover, inclusive. */
  coverage: { startDate: string; endDate: string };
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

  /**
   * `null` when the month has no published Sellpia facts, or its facts do not
   * share one coverage window; the caller then keeps the order ranking.
   */
  fetchSellpiaTopProducts(
    organizationId: string,
    yearMonth: string,
  ): Promise<SellpiaTopProductsRead | null>;
}
