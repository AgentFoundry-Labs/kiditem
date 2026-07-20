// Outgoing port for Coupang Rocket (supplier 발주) revenue. Rocket revenue is
// the sum of confirmed purchase-order amounts (공급가), keyed by 발주일(KST).
// The dashboard reads it as a separate revenue lane and adds it on top of the
// Wing/order revenue.

export const ROCKET_REVENUE_REPOSITORY_PORT = Symbol('RocketRevenueRepositoryPort');

export interface RocketRevenueMetrics {
  revenue: number;
  poCount: number;
  itemQty: number;
  hasData: boolean;
  lastObservedAt: Date | null;
}

export interface RocketDailyRow {
  date: string;
  revenue: number;
  poCount: number;
  itemQty: number;
}

export interface RocketOrderItem {
  name: string;
  qty: number;
  amount: number;
  expectedInboundDate?: string | null;
}

export interface RocketOrderRow {
  poSeq: number;
  businessDate: string;
  orderedAt: string;
  expectedInboundDate: string | null;
  status: string | null;
  vendorName: string | null;
  centerName: string | null;
  firstSkuName: string | null;
  skuCount: number;
  orderQty: number;
  orderAmount: number;
  items: RocketOrderItem[];
}

export interface RocketRevenueRepositoryPort {
  findLatestDataDate(organizationId: string): Promise<Date | null>;

  aggregateRevenue(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<RocketRevenueMetrics>;

  fetchDaily(
    organizationId: string,
    since: Date,
    until?: Date,
  ): Promise<RocketDailyRow[]>;

  fetchOrdersForDate(
    organizationId: string,
    date: Date,
  ): Promise<RocketOrderRow[]>;

  fetchOrders(
    organizationId: string,
    from: Date,
    to: Date,
    status?: string,
  ): Promise<RocketOrderRow[]>;
}
