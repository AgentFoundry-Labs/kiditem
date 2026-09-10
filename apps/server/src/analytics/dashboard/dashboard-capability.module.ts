import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProfitabilityEvidenceModule } from '../../finance/profitability-evidence.module';
import { AdvertisingModule } from '../../advertising/advertising.module';
import { AnalyticsOverviewCapabilityAdapter } from './adapter/in/agent/analytics-overview-capability.adapter';
import { ProfitCalculationRepositoryAdapter } from './adapter/out/repository/profit-calculation.repository.adapter';
import { WingAdSummaryRepositoryAdapter } from './adapter/out/repository/wing-ad-summary.repository.adapter';
import { DashboardSalesRepositoryAdapter } from './adapter/out/repository/dashboard-sales.repository.adapter';
import { DashboardTrendRepositoryAdapter } from './adapter/out/repository/dashboard-trend.repository.adapter';
import { WingTrafficAggregationRepositoryAdapter } from './adapter/out/repository/wing-traffic-aggregation.repository.adapter';
import { DashboardInventoryRepositoryAdapter } from './adapter/out/repository/dashboard-inventory.repository.adapter';
import { ANALYTICS_OVERVIEW_CAPABILITY_PORT } from './application/port/in/analytics-overview-capability.port';
import { PROFIT_CALCULATION_REPOSITORY_PORT } from './application/port/out/repository/profit-calculation.repository.port';
import { WING_AD_SUMMARY_REPOSITORY_PORT } from './application/port/out/repository/wing-ad-summary.repository.port';
import { DASHBOARD_SALES_REPOSITORY_PORT } from './application/port/out/repository/dashboard-sales.repository.port';
import { DASHBOARD_TREND_REPOSITORY_PORT } from './application/port/out/repository/dashboard-trend.repository.port';
import { WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT } from './application/port/out/repository/wing-traffic-aggregation.repository.port';
import { DASHBOARD_INVENTORY_REPOSITORY_PORT } from './application/port/out/repository/dashboard-inventory.repository.port';
import { DashboardContextService } from './application/service/dashboard-context.service';
import { DashboardSalesService } from './application/service/dashboard-sales.service';
import { DashboardAdService } from './application/service/dashboard-ad.service';
import { DashboardInventoryService } from './application/service/dashboard-inventory.service';
import { DashboardTrendService } from './application/service/dashboard-trend.service';

const repositoryAdapters = [
  ProfitCalculationRepositoryAdapter,
  WingAdSummaryRepositoryAdapter,
  DashboardSalesRepositoryAdapter,
  DashboardTrendRepositoryAdapter,
  WingTrafficAggregationRepositoryAdapter,
  DashboardInventoryRepositoryAdapter,
];

const repositoryPorts = [
  { provide: PROFIT_CALCULATION_REPOSITORY_PORT, useExisting: ProfitCalculationRepositoryAdapter },
  { provide: WING_AD_SUMMARY_REPOSITORY_PORT, useExisting: WingAdSummaryRepositoryAdapter },
  { provide: DASHBOARD_SALES_REPOSITORY_PORT, useExisting: DashboardSalesRepositoryAdapter },
  { provide: DASHBOARD_TREND_REPOSITORY_PORT, useExisting: DashboardTrendRepositoryAdapter },
  { provide: WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT, useExisting: WingTrafficAggregationRepositoryAdapter },
  { provide: DASHBOARD_INVENTORY_REPOSITORY_PORT, useExisting: DashboardInventoryRepositoryAdapter },
];

const dashboardServices = [
  DashboardContextService,
  DashboardSalesService,
  DashboardAdService,
  DashboardInventoryService,
  DashboardTrendService,
];

@Module({
  imports: [PrismaModule, ProfitabilityEvidenceModule, AdvertisingModule],
  providers: [
    ...repositoryAdapters,
    ...dashboardServices,
    AnalyticsOverviewCapabilityAdapter,
    {
      provide: ANALYTICS_OVERVIEW_CAPABILITY_PORT,
      useExisting: AnalyticsOverviewCapabilityAdapter,
    },
    ...repositoryPorts,
  ],
  exports: [
    ...dashboardServices,
    WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT,
    ANALYTICS_OVERVIEW_CAPABILITY_PORT,
  ],
})
export class DashboardCapabilityModule {}
