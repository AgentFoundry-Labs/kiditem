import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ProfitLossController } from './controllers/profit-loss.controller';
import { ProfitLossService } from './services/profit-loss.service';
import { SalesAnalysisController } from './controllers/sales-analysis.controller';
import { SalesAnalysisService } from './services/sales-analysis.service';
import { SalesAnalysisScraperService } from './services/sales-analysis-scraper.service';
import { SupplierPaymentsController } from './supplier-payments/supplier-payments.controller';
import { SupplierPaymentsService } from './supplier-payments/supplier-payments.service';
import { SalesPlansController } from './sales-plans/sales-plans.controller';
import { SalesPlansService } from './sales-plans/sales-plans.service';
import { SettlementsController } from './settlements/settlements.controller';
import { SettlementsService } from './settlements/settlements.service';
import { FinanceOperationAlertAdapter } from './adapter/out/automation/operation-alert.adapter';
import { FINANCE_OPERATION_ALERT_PORT } from './application/port/out/cross-domain/operation-alert.port';
import { ProfitabilityEvidenceModule } from './profitability-evidence.module';
import { MasterProductContributionRepositoryAdapter } from './adapter/out/repository/master-product-contribution.repository.adapter';
import { MASTER_PRODUCT_CONTRIBUTION_READ_PORT } from './application/port/in/master-product-contribution-read.port';
import { MASTER_PRODUCT_CONTRIBUTION_REPOSITORY_PORT } from './application/port/out/repository/master-product-contribution.repository.port';
import { MasterProductContributionReadService } from './application/service/master-product-contribution-read.service';

@Module({
  imports: [
    AutomationModule,
    AnalyticsModule,
    ProfitabilityEvidenceModule,
  ],
  controllers: [
    ProfitLossController,
    SalesAnalysisController,
    SupplierPaymentsController,
    SalesPlansController,
    SettlementsController,
  ],
  providers: [
    ProfitLossService,
    SalesAnalysisService,
    SalesAnalysisScraperService,
    SupplierPaymentsService,
    SalesPlansService,
    SettlementsService,
    MasterProductContributionRepositoryAdapter,
    MasterProductContributionReadService,
    FinanceOperationAlertAdapter,
    {
      provide: MASTER_PRODUCT_CONTRIBUTION_REPOSITORY_PORT,
      useExisting: MasterProductContributionRepositoryAdapter,
    },
    {
      provide: MASTER_PRODUCT_CONTRIBUTION_READ_PORT,
      useExisting: MasterProductContributionReadService,
    },
    { provide: FINANCE_OPERATION_ALERT_PORT, useExisting: FinanceOperationAlertAdapter },
  ],
  exports: [ProfitabilityEvidenceModule, MASTER_PRODUCT_CONTRIBUTION_READ_PORT],
})
export class FinanceModule {}
