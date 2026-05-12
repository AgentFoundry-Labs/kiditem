// Outgoing port for the per-period profit aggregate that the dashboard
// services depend on. Sums revenue, settlement costs, ad metrics, and
// derives netProfit/profitRate against `OrderLineItem.totalPrice` (I3
// canonical). Caller scopes by organizationId; the adapter binds the same
// predicate on every read (orders + listing daily-fact ad columns).

export const PROFIT_CALCULATION_REPOSITORY_PORT = Symbol(
  'ProfitCalculationRepositoryPort',
);

export interface RangeProfitMetrics {
  revenue: number;
  costOfGoods: number;
  commission: number;
  shippingCost: number;
  adCost: number;
  otherCost: number;
  netProfit: number;
  profitRate: number;
  orderCount: number;
  adRevenue: number;
  adImpressions: number;
  adClicks: number;
  adConversions: number;
}

export interface ProfitCalculationRepositoryPort {
  calculateForRange(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<RangeProfitMetrics>;
}
