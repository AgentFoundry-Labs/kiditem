import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getSummary() {
    return this.dashboardService.getSummary();
  }

  @Get('trend')
  getTrend(@Query('range') range: string) {
    return this.dashboardService.getTrend(range || '30d');
  }
}
