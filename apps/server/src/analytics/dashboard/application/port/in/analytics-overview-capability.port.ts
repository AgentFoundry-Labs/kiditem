export const ANALYTICS_OVERVIEW_CAPABILITY_PORT = Symbol(
  'ANALYTICS_OVERVIEW_CAPABILITY_PORT',
);

export interface AnalyticsOverview {
  [key: string]: unknown;
  sales: { revenue: number; orders: number };
  inventory: { outOfStockSkus: number; mappingAttentionSkus: number };
  freshness: { lastSync: string | null; confirmedUntil: string | null };
}

export interface AnalyticsOverviewCapabilityPort {
  readOverview(input: {
    organizationId: string;
    now: Date;
    period?: 'today' | 'month';
  }): Promise<AnalyticsOverview>;
}
