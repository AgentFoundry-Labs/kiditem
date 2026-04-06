import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardTrendQueryDto } from './dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getSummary(
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboardService.getSummary(range, from, to);
  }

  @Get('trend')
  getTrend(@Query() query: DashboardTrendQueryDto) {
    return this.dashboardService.getTrend(query.range);
  }
}
