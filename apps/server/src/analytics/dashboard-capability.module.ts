import { AiListingContentQueryModule } from '../content/ai-listing-content-query.module';
import { ChannelCatalogModule } from '../channels/channel-catalog.module';
import { SellpiaProductSalesModule } from './sellpia-product-sales/sellpia-product-sales.module';
import { DashboardFindingsService } from './application/service/dashboard/dashboard-findings.service';
import { DashboardFindingsRepositoryAdapter } from './adapter/out/persistence/dashboard/dashboard-findings.repository';
import { DASHBOARD_FINDINGS_REPOSITORY_PORT } from './application/port/out/repository/dashboard/dashboard-findings.repository.port';
import { Module } from '@nestjs/common';
import { OrderCollectionTodayOrdersModule } from '../orders/order-collection-today-orders.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductAbcReadModule } from '../products/product-abc-read.module';
import { AdvertisingModule } from '../advertising/advertising.module';
import { AlertsModule } from '../alerts/alerts.module';
import { ProductCollectionRuntimeModule } from '../products/product-collection-runtime.module';
import { AnalyticsOverviewCapabilityAdapter } from './adapter/in/agent/dashboard/analytics-overview-capability.adapter';
import { ProfitCalculationRepositoryAdapter } from './adapter/out/persistence/dashboard/profit-calculation.repository';
import { DashboardSalesRepositoryAdapter } from './adapter/out/persistence/dashboard/dashboard-sales.repository';
import { DashboardTrendRepositoryAdapter } from './adapter/out/persistence/dashboard/dashboard-trend.repository';
import { WingTrafficAggregationRepositoryAdapter } from './adapter/out/persistence/dashboard/wing-traffic-aggregation.repository';
import { DashboardInventoryRepositoryAdapter } from './adapter/out/persistence/dashboard/dashboard-inventory.repository';
import { ANALYTICS_OVERVIEW_CAPABILITY_PORT } from './application/port/in/dashboard/analytics-overview-capability.port';
import { PROFIT_CALCULATION_REPOSITORY_PORT } from './application/port/out/repository/dashboard/profit-calculation.repository.port';
import { DASHBOARD_SALES_REPOSITORY_PORT } from './application/port/out/repository/dashboard/dashboard-sales.repository.port';
import { DASHBOARD_TREND_REPOSITORY_PORT } from './application/port/out/repository/dashboard/dashboard-trend.repository.port';
import { WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT } from './application/port/out/repository/dashboard/wing-traffic-aggregation.repository.port';
import { DASHBOARD_INVENTORY_REPOSITORY_PORT } from './application/port/out/repository/dashboard/dashboard-inventory.repository.port';
import { DashboardSalesService } from './application/service/dashboard/dashboard-sales.service';
import { DashboardAdService } from './application/service/dashboard/dashboard-ad.service';
import { DashboardInventoryService } from './application/service/dashboard/dashboard-inventory.service';
import { DashboardTrendService } from './application/service/dashboard/dashboard-trend.service';
import { DashboardCollectionsService } from './application/service/dashboard/dashboard-collections.service';

const repositoryAdapters = [
  DashboardFindingsRepositoryAdapter,
  ProfitCalculationRepositoryAdapter,
  DashboardSalesRepositoryAdapter,
  DashboardTrendRepositoryAdapter,
  WingTrafficAggregationRepositoryAdapter,
  DashboardInventoryRepositoryAdapter,
];

const repositoryPorts = [
  { provide: DASHBOARD_FINDINGS_REPOSITORY_PORT, useExisting: DashboardFindingsRepositoryAdapter },
  { provide: PROFIT_CALCULATION_REPOSITORY_PORT, useExisting: ProfitCalculationRepositoryAdapter },
  { provide: DASHBOARD_SALES_REPOSITORY_PORT, useExisting: DashboardSalesRepositoryAdapter },
  { provide: DASHBOARD_TREND_REPOSITORY_PORT, useExisting: DashboardTrendRepositoryAdapter },
  { provide: WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT, useExisting: WingTrafficAggregationRepositoryAdapter },
  { provide: DASHBOARD_INVENTORY_REPOSITORY_PORT, useExisting: DashboardInventoryRepositoryAdapter },
];

const dashboardServices = [
  DashboardFindingsService,
  DashboardSalesService,
  DashboardAdService,
  DashboardInventoryService,
  DashboardTrendService,
  DashboardCollectionsService,
];

@Module({
  imports: [AiListingContentQueryModule, ChannelCatalogModule, SellpiaProductSalesModule, PrismaModule, ProductAbcReadModule, AdvertisingModule, AlertsModule, ProductCollectionRuntimeModule, OrderCollectionTodayOrdersModule],
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
