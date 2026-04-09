import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardTrendQueryDto, DashboardSummaryQueryDto } from './dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getSummary(@Query() query: DashboardSummaryQueryDto) {
    return this.dashboardService.getSummary(query.range, query.from, query.to);
  }

  @Get('trend')
  getTrend(@Query() query: DashboardTrendQueryDto) {
    return this.dashboardService.getTrend(query.range);
  }
}
