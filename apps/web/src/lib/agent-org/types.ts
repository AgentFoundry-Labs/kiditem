import type { DashboardAdSummary, DashboardSalesSummary } from '@kiditem/shared/dashboard';

/** The read-only business summaries shown in Agent Org's lower dashboard. */
export interface PipeBusiness {
  sales: DashboardSalesSummary | null;
  ad: DashboardAdSummary | null;
  salesFailed: boolean;
  adFailed: boolean;
}
