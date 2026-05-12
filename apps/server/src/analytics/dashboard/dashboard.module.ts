import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';

import { DashboardController } from './adapter/in/http/dashboard.controller';

// adapter/out/repository
import { ProfitCalculationRepositoryAdapter } from './adapter/out/repository/profit-calculation.repository.adapter';
import { AdAggregationRepositoryAdapter } from './adapter/out/repository/ad-aggregation.repository.adapter';
import { WingAdSummaryRepositoryAdapter } from './adapter/out/repository/wing-ad-summary.repository.adapter';
import { DashboardSalesRepositoryAdapter } from './adapter/out/repository/dashboard-sales.repository.adapter';
import { DashboardAdRepositoryAdapter } from './adapter/out/repository/dashboard-ad.repository.adapter';
import { DashboardTrendRepositoryAdapter } from './adapter/out/repository/dashboard-trend.repository.adapter';
import { WingTrafficAggregationRepositoryAdapter } from './adapter/out/repository/wing-traffic-aggregation.repository.adapter';
import { DashboardInventoryRepositoryAdapter } from './adapter/out/repository/dashboard-inventory.repository.adapter';

// application/service
import { DashboardContextService } from './application/service/dashboard-context.service';
import { DashboardSalesService } from './application/service/dashboard-sales.service';
import { DashboardAdService } from './application/service/dashboard-ad.service';
import { DashboardInventoryService } from './application/service/dashboard-inventory.service';
import { DashboardTrendService } from './application/service/dashboard-trend.service';

// application/port/out tokens
import { PROFIT_CALCULATION_REPOSITORY_PORT } from './application/port/out/profit-calculation.repository.port';
import { AD_AGGREGATION_REPOSITORY_PORT } from './application/port/out/ad-aggregation.repository.port';
import { WING_AD_SUMMARY_REPOSITORY_PORT } from './application/port/out/wing-ad-summary.repository.port';
import { DASHBOARD_SALES_REPOSITORY_PORT } from './application/port/out/dashboard-sales.repository.port';
import { DASHBOARD_AD_REPOSITORY_PORT } from './application/port/out/dashboard-ad.repository.port';
import { DASHBOARD_TREND_REPOSITORY_PORT } from './application/port/out/dashboard-trend.repository.port';
import { WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT } from './application/port/out/wing-traffic-aggregation.repository.port';
import { DASHBOARD_INVENTORY_REPOSITORY_PORT } from './application/port/out/dashboard-inventory.repository.port';

// `application/port/out/*` ports bound to their adapters via `useExisting`
// so application services depend on tokens, not concrete classes. Mirrors
// the advertising module pattern.
const REPOSITORY_PORT_BINDINGS = [
  { provide: PROFIT_CALCULATION_REPOSITORY_PORT, useExisting: ProfitCalculationRepositoryAdapter },
  { provide: AD_AGGREGATION_REPOSITORY_PORT, useExisting: AdAggregationRepositoryAdapter },
  { provide: WING_AD_SUMMARY_REPOSITORY_PORT, useExisting: WingAdSummaryRepositoryAdapter },
  { provide: DASHBOARD_SALES_REPOSITORY_PORT, useExisting: DashboardSalesRepositoryAdapter },
  { provide: DASHBOARD_AD_REPOSITORY_PORT, useExisting: DashboardAdRepositoryAdapter },
  { provide: DASHBOARD_TREND_REPOSITORY_PORT, useExisting: DashboardTrendRepositoryAdapter },
  { provide: WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT, useExisting: WingTrafficAggregationRepositoryAdapter },
  { provide: DASHBOARD_INVENTORY_REPOSITORY_PORT, useExisting: DashboardInventoryRepositoryAdapter },
];

@Module({
  imports: [PrismaModule],
  controllers: [DashboardController],
  providers: [
    // adapter/out/repository
    ProfitCalculationRepositoryAdapter,
    AdAggregationRepositoryAdapter,
    WingAdSummaryRepositoryAdapter,
    DashboardSalesRepositoryAdapter,
    DashboardAdRepositoryAdapter,
    DashboardTrendRepositoryAdapter,
    WingTrafficAggregationRepositoryAdapter,
    DashboardInventoryRepositoryAdapter,
    // application/service
    DashboardContextService,
    DashboardSalesService,
    DashboardAdService,
    DashboardInventoryService,
    DashboardTrendService,
    // port bindings
    ...REPOSITORY_PORT_BINDINGS,
  ],
})
export class DashboardModule {}
