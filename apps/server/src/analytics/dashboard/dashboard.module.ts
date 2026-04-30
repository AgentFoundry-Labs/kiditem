import { Module } from '@nestjs/common';
import { DashboardController } from './adapter/in/http/dashboard.controller';
import { DashboardSalesService } from './application/service/dashboard-sales.service';
import { DashboardAdService } from './application/service/dashboard-ad.service';
import { DashboardInventoryService } from './application/service/dashboard-inventory.service';
import { DashboardTrendService } from './application/service/dashboard-trend.service';
import { DashboardSalesRepositoryAdapter } from './adapter/out/repository/dashboard-sales.repository.adapter';
import { DashboardAdRepositoryAdapter } from './adapter/out/repository/dashboard-ad.repository.adapter';
import { DashboardTrendRepositoryAdapter } from './adapter/out/repository/dashboard-trend.repository.adapter';

@Module({
  controllers: [DashboardController],
  providers: [
    DashboardSalesService,
    DashboardAdService,
    DashboardInventoryService,
    DashboardTrendService,
    DashboardSalesRepositoryAdapter,
    DashboardAdRepositoryAdapter,
    DashboardTrendRepositoryAdapter,
  ],
})
export class DashboardModule {}
