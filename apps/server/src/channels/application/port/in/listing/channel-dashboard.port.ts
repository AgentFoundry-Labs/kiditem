export const CHANNEL_DASHBOARD_PORT = Symbol('CHANNEL_DASHBOARD_PORT');

export interface ChannelDashboardPort {
  getSummary(organizationId: string): Promise<{
    todayOrders:
      | {
          count: number;
          revenue: number;
        }
      | {
          count: null;
          revenue: null;
        };
    pendingAccept: number;
    lastModifiedAt: string | Date | null;
  }>;
  getRevenueTrend(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<
    {
      revenue: number;
      day: string;
      orderCount: number;
    }[]
  >;
  getProductRanking(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<
    {
      revenue: number;
      orderCount: number;
      sellerProductId: string;
      sellerProductName: string;
    }[]
  >;
}
