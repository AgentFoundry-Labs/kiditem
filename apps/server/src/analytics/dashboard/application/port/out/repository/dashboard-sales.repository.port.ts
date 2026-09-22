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
  /**
   * 지금까지 실제로 걷힌 주문 수. 하루가 다 걷히지 않아 `orders` 가 `null` 이어도 이 수는
   * 진짜 걷힌 수다 — 주문수집 화면이 보여 주는 바로 그 수. 대시보드가 이걸 감추는 바람에
   * 한 화면은 50건이라 하고 대시보드는 아무것도 없다고 했다(사장님 2026-09-21).
   */
  collectedOrders: number | null;
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
