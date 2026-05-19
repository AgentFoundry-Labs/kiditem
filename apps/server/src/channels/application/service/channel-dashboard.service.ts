import { Inject, Injectable } from '@nestjs/common';
import {
  CHANNEL_DASHBOARD_REPOSITORY_PORT,
  type ChannelDashboardRepositoryPort,
} from '../port/out/repository/channel-dashboard.repository.port';

@Injectable()
export class ChannelDashboardService {
  constructor(
    @Inject(CHANNEL_DASHBOARD_REPOSITORY_PORT)
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

  getReturnSummary(organizationId: string, from: Date, to: Date) {
    return this.repository.getReturnSummary(organizationId, from, to);
  }

  getReturnReasonBreakdown(organizationId: string, from: Date, to: Date) {
    return this.repository.getReturnReasonBreakdown(organizationId, from, to);
  }

  getReturnFaultSplit(organizationId: string, from: Date, to: Date) {
    return this.repository.getReturnFaultSplit(organizationId, from, to);
  }
}
