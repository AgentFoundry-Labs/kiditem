import { Controller, Get, Query } from '@nestjs/common';
import { TrafficService } from '../../../../application/service/traffic/traffic.service';
import { CurrentOrganization } from '../../../../../auth/decorators/current-organization.decorator';
import type { AdTrafficSourceReconciliation } from '@kiditem/shared/advertising';

interface MonthlyTrafficResponse {
  year: number;
  month: number;
  days: Array<{
    date: string;
    revenue: number;
    orders: number;
    salesQty: number;
    visitors: number;
    views: number;
    cartAdds: number;
  }>;
  total: {
    revenue: number | null;
    orders: number | null;
    salesQty: number | null;
    visitors: number | null;
    views: number | null;
    cartAdds: number | null;
  };
  averageDailyVisitors: number | null;
  coverage: {
    from: string;
    to: string;
    targetDays: number;
    completedDays: number;
    missingDates: string[];
  };
  reconciliation: AdTrafficSourceReconciliation | null;
}

@Controller('traffic')
export class TrafficController {
  constructor(private readonly trafficService: TrafficService) {}

  @Get('summary')
  async summary(
    @Query('days') days: string | undefined,
    @CurrentOrganization() organizationId: string,
  ) {
    const d = days ? parseInt(days, 10) : 30;
    return this.trafficService.getTrafficSummary(d, organizationId);
  }

  @Get('monthly')
  async monthly(
    @Query('year') year: string | undefined,
    @Query('month') month: string | undefined,
    @CurrentOrganization() organizationId: string,
  ): Promise<MonthlyTrafficResponse> {
    const now = new Date();
    const y = year ? parseInt(year, 10) : now.getFullYear();
    const m = month ? parseInt(month, 10) : now.getMonth() + 1;
    return this.trafficService.getMonthlyRevenue(y, m, organizationId);
  }
}
