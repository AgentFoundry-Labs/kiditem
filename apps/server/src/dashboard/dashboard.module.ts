import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardSalesService } from './services/dashboard-sales.service';
import { DashboardAdService } from './services/dashboard-ad.service';
import { DashboardInventoryService } from './services/dashboard-inventory.service';
import { DashboardTrendService } from './services/dashboard-trend.service';

@Module({
  controllers: [DashboardController],
  providers: [
    DashboardSalesService,
    DashboardAdService,
    DashboardInventoryService,
    DashboardTrendService,
  ],
})
export class DashboardModule {}
