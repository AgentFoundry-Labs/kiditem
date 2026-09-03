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
    FinanceOperationAlertAdapter,
    { provide: FINANCE_OPERATION_ALERT_PORT, useExisting: FinanceOperationAlertAdapter },
  ],
  exports: [ProfitabilityEvidenceModule],
})
export class FinanceModule {}
