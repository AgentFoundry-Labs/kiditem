import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AdvertisingProfitabilityReadModule } from '../../advertising/advertising-profitability-read.module';
import { AnalyticsModule } from '../../analytics/analytics.module';
import { AutomationModule } from '../../automation/automation.module';
import { FinanceOperationAlertAdapter } from '../adapter/out/automation/operation-alert.adapter';
import { MASTER_PRODUCT_PROFITABILITY_READ_PORT } from '../application/port/in/master-product-profitability-read.port';
import { FINANCE_OPERATION_ALERT_PORT } from '../application/port/out/cross-domain/operation-alert.port';
import { MasterProductProfitabilityReadService } from '../application/service/master-product-profitability-read.service';
import { ProfitLossController } from '../controllers/profit-loss.controller';
import { SalesAnalysisController } from '../controllers/sales-analysis.controller';
import { FinanceModule } from '../finance.module';
import { SalesPlansController } from '../sales-plans/sales-plans.controller';
import { SalesPlansService } from '../sales-plans/sales-plans.service';
import { ProfitLossService } from '../services/profit-loss.service';
import { SalesAnalysisScraperService } from '../services/sales-analysis-scraper.service';
import { SalesAnalysisService } from '../services/sales-analysis.service';
import { SettlementsController } from '../settlements/settlements.controller';
import { SettlementsService } from '../settlements/settlements.service';
import { SupplierPaymentsController } from '../supplier-payments/supplier-payments.controller';
import { SupplierPaymentsService } from '../supplier-payments/supplier-payments.service';

describe('FinanceModule capability wiring', () => {
  it('registers and exports the complete surviving Finance capability set', () => {
    const imports: unknown[] = Reflect.getMetadata('imports', FinanceModule) ?? [];
    const controllers: unknown[] = Reflect.getMetadata('controllers', FinanceModule) ?? [];
    const providers: unknown[] = Reflect.getMetadata('providers', FinanceModule) ?? [];
    const exports: unknown[] = Reflect.getMetadata('exports', FinanceModule) ?? [];

    expect(imports).toEqual([
      AutomationModule,
      AnalyticsModule,
      AdvertisingProfitabilityReadModule,
    ]);
    expect(controllers).toEqual([
      ProfitLossController,
      SalesAnalysisController,
      SupplierPaymentsController,
      SalesPlansController,
      SettlementsController,
    ]);
    expect(providers).toEqual([
      ProfitLossService,
      SalesAnalysisService,
      SalesAnalysisScraperService,
      SupplierPaymentsService,
      SalesPlansService,
      SettlementsService,
      FinanceOperationAlertAdapter,
      MasterProductProfitabilityReadService,
      {
        provide: FINANCE_OPERATION_ALERT_PORT,
        useExisting: FinanceOperationAlertAdapter,
      },
      {
        provide: MASTER_PRODUCT_PROFITABILITY_READ_PORT,
        useExisting: MasterProductProfitabilityReadService,
      },
    ]);
    expect(exports).toEqual([MASTER_PRODUCT_PROFITABILITY_READ_PORT]);
  });
});
