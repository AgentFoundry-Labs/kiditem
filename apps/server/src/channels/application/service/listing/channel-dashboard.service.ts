import type { ChannelDashboardPort } from "../../port/in/listing/channel-dashboard.port";

import {
  CHANNEL_DASHBOARD_REPOSITORY_PORT,
  type ChannelDashboardRepositoryPort,
} from '../../port/out/repository/channel-dashboard.repository.port';


export class ChannelDashboardService implements ChannelDashboardPort {
  constructor(

    private readonly repository: ChannelDashboardRepositoryPort,
  ) {}

  getSummary(organizationId: string) {
    return this.repository.getSummary(organizationId);
  }

  getRevenueTrend(organizationId: string, from: Date, to: Date) {
    return this.repository.getRevenueTrend(organizationId, from, to);
  }

  getProductRanking(organizationId: string, from: Date, to: Date) {
    return this.repository.getProductRanking(organizationId, from, to);
  }
}
