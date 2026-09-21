import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProductAbcReadModule } from '../../products/product-abc-read.module';
import { AdvertisingModule } from '../../advertising/advertising.module';
import { AlertsModule } from '../../alerts/alerts.module';
import { ProductCollectionRuntimeModule } from '../../products/product-collection-runtime.module';
import { AnalyticsOverviewCapabilityAdapter } from './adapter/in/agent/analytics-overview-capability.adapter';
import { ProfitCalculationRepositoryAdapter } from './adapter/out/repository/profit-calculation.repository.adapter';
import { DashboardSalesRepositoryAdapter } from './adapter/out/repository/dashboard-sales.repository.adapter';
import { DashboardTrendRepositoryAdapter } from './adapter/out/repository/dashboard-trend.repository.adapter';
import { WingTrafficAggregationRepositoryAdapter } from './adapter/out/repository/wing-traffic-aggregation.repository.adapter';
import { DashboardInventoryRepositoryAdapter } from './adapter/out/repository/dashboard-inventory.repository.adapter';
import { CollectionFreshnessRepositoryAdapter } from './adapter/out/repository/collection-freshness.repository.adapter';
import { ANALYTICS_OVERVIEW_CAPABILITY_PORT } from './application/port/in/analytics-overview-capability.port';
import { PROFIT_CALCULATION_REPOSITORY_PORT } from './application/port/out/repository/profit-calculation.repository.port';
import { DASHBOARD_SALES_REPOSITORY_PORT } from './application/port/out/repository/dashboard-sales.repository.port';
import { DASHBOARD_TREND_REPOSITORY_PORT } from './application/port/out/repository/dashboard-trend.repository.port';
import { WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT } from './application/port/out/repository/wing-traffic-aggregation.repository.port';
import { DASHBOARD_INVENTORY_REPOSITORY_PORT } from './application/port/out/repository/dashboard-inventory.repository.port';
import { COLLECTION_FRESHNESS_REPOSITORY_PORT } from './application/port/out/repository/collection-freshness.repository.port';
import { DashboardSalesService } from './application/service/dashboard-sales.service';
import { DashboardAdService } from './application/service/dashboard-ad.service';
import { DashboardInventoryService } from './application/service/dashboard-inventory.service';
import { DashboardTrendService } from './application/service/dashboard-trend.service';
import { DashboardCollectionsService } from './application/service/dashboard-collections.service';

const repositoryAdapters = [
  ProfitCalculationRepositoryAdapter,
  DashboardSalesRepositoryAdapter,
  DashboardTrendRepositoryAdapter,
  WingTrafficAggregationRepositoryAdapter,
  DashboardInventoryRepositoryAdapter,
  CollectionFreshnessRepositoryAdapter,
];

const repositoryPorts = [
  { provide: PROFIT_CALCULATION_REPOSITORY_PORT, useExisting: ProfitCalculationRepositoryAdapter },
  { provide: DASHBOARD_SALES_REPOSITORY_PORT, useExisting: DashboardSalesRepositoryAdapter },
  { provide: DASHBOARD_TREND_REPOSITORY_PORT, useExisting: DashboardTrendRepositoryAdapter },
  { provide: WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT, useExisting: WingTrafficAggregationRepositoryAdapter },
  { provide: DASHBOARD_INVENTORY_REPOSITORY_PORT, useExisting: DashboardInventoryRepositoryAdapter },
  { provide: COLLECTION_FRESHNESS_REPOSITORY_PORT, useExisting: CollectionFreshnessRepositoryAdapter },
];

const dashboardServices = [
  DashboardSalesService,
  DashboardAdService,
  DashboardInventoryService,
  DashboardTrendService,
  DashboardCollectionsService,
];

@Module({
  imports: [PrismaModule, ProductAbcReadModule, AdvertisingModule, AlertsModule, ProductCollectionRuntimeModule],
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
