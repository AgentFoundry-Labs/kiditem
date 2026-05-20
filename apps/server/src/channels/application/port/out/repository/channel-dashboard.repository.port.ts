import type { ReturnSummary } from '@kiditem/shared/return-summary';
import type {
  ChannelDashboardSummary,
  RevenueTrendPoint,
  ProductRankingRow,
  ReturnReasonRow,
  ReturnFaultSplit,
} from '@kiditem/shared/channel-dashboard';

export const CHANNEL_DASHBOARD_REPOSITORY_PORT = Symbol('CHANNEL_DASHBOARD_REPOSITORY_PORT');

export interface ChannelDashboardRepositoryPort {
  getSummary(organizationId: string): Promise<ChannelDashboardSummary>;

  getRevenueTrend(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<RevenueTrendPoint[]>;

  getProductRanking(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<ProductRankingRow[]>;

  getReturnSummary(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<ReturnSummary>;

  getReturnReasonBreakdown(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<ReturnReasonRow[]>;

  getReturnFaultSplit(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<ReturnFaultSplit>;
}
