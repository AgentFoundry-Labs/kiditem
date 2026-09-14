import type {
  ChannelDashboardSummary,
  RevenueTrendPoint,
  ProductRankingRow,
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
}
