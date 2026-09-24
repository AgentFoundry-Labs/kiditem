export const ANALYTICS_OVERVIEW_CAPABILITY_PORT = Symbol(
  'ANALYTICS_OVERVIEW_CAPABILITY_PORT',
);
export const ANALYTICS_AGENT_OVERVIEW_CAPABILITY_PORT = Symbol(
  'ANALYTICS_AGENT_OVERVIEW_CAPABILITY_PORT',
);

export interface AnalyticsOverview {
  [key: string]: unknown;
  sales: { revenue: number | null; orders: number | null };
  inventory: { outOfStockSkus: number | null; mappingAttentionSkus: number };
  freshness: { lastSync: string | null };
}

export interface AnalyticsOverviewCapabilityPort {
  readOverview(input: {
    organizationId: string;
    now: Date;
    period?: 'today' | 'month';
  }): Promise<AnalyticsOverview>;
}

/** Agent-facing owner port omits dashboard clock control. */
export interface AnalyticsAgentOverviewCapabilityPort {
  readOverview(input: {
    organizationId: string;
    period?: 'today' | 'month';
  }): Promise<AnalyticsOverview>;
}
