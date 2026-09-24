import { AiListingContentQueryModule } from '../../content/ai-listing-content-query.module';
import { ChannelCatalogModule } from '../../channels/channel-catalog.module';
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AdvertisingModule } from '../../advertising/advertising.module';
import { AnalyticsModule } from '../../analytics/analytics.module';
import { ChannelsModule } from '../../channels/channels.module';
import { ProductCollectionRuntimeModule } from '../../products/product-collection-runtime.module';
import { ProductSourceModule } from '../../products/product-source.module';
import { FinanceReportExportController } from '../adapter/in/web/report-export/finance-report-export.controller';
import { MasterProductContributionRepositoryAdapter } from '../adapter/out/repository/master-product-contribution.repository.adapter';
import { MASTER_PRODUCT_CONTRIBUTION_READ_PORT } from '../application/port/in/master-product-contribution-read.port';
import { MASTER_PRODUCT_CONTRIBUTION_REPOSITORY_PORT } from '../application/port/out/repository/master-product-contribution.repository.port';
import { MasterProductContributionReadService } from '../application/service/master-product-contribution-read.service';
import { ProfitLossController } from '../adapter/in/web/profit-loss/profit-loss.controller';
import { SalesAnalysisController } from '../adapter/in/web/sales-analysis/sales-analysis.controller';
import { FinanceModule } from '../finance.module';
import { ProfitabilityEvidenceModule } from '../profitability-evidence.module';
import { SalesPlansController } from '../adapter/in/web/sales-plan/sales-plans.controller';
import { SalesPlansService } from '../application/service/sales-plan/sales-plans.service';
import { ProfitLossService } from '../application/service/profit-loss/profit-loss.service';
import { SalesAnalysisScraperService } from '../application/service/sales-analysis/sales-analysis-scraper.service';
import { SalesAnalysisService } from '../application/service/sales-analysis/sales-analysis.service';
import { SettlementsController } from '../adapter/in/web/settlement/settlements.controller';
import { SettlementsService } from '../application/service/settlement/settlements.service';
import { FinanceReportExportService } from '../application/service/report-export/finance-report-export.service';
import { SupplierPaymentsController } from '../adapter/in/web/supplier-payment/supplier-payments.controller';
import { SupplierPaymentsService } from '../application/service/supplier-payment/supplier-payments.service';

describe('FinanceModule capability wiring', () => {
  it('registers and exports the complete surviving Finance capability set', () => {
    const imports: unknown[] = Reflect.getMetadata('imports', FinanceModule) ?? [];
    const controllers: unknown[] = Reflect.getMetadata('controllers', FinanceModule) ?? [];
    const providers: unknown[] = Reflect.getMetadata('providers', FinanceModule) ?? [];
    const exports: unknown[] = Reflect.getMetadata('exports', FinanceModule) ?? [];

    expect(imports).toEqual([
      AiListingContentQueryModule,
      ChannelCatalogModule,
      AnalyticsModule,
      AdvertisingModule,
      ChannelsModule,
      ProductCollectionRuntimeModule,
      ProductSourceModule,
      ProfitabilityEvidenceModule,
    ]);
    expect(controllers).toEqual([
      ProfitLossController,
      FinanceReportExportController,
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
      MasterProductContributionRepositoryAdapter,
      MasterProductContributionReadService,
      FinanceReportExportService,
      {
        provide: MASTER_PRODUCT_CONTRIBUTION_REPOSITORY_PORT,
        useExisting: MasterProductContributionRepositoryAdapter,
      },
      {
        provide: MASTER_PRODUCT_CONTRIBUTION_READ_PORT,
        useExisting: MasterProductContributionReadService,
      },
    ]);
    expect(exports).toEqual([
      ProfitabilityEvidenceModule,
      MASTER_PRODUCT_CONTRIBUTION_READ_PORT,
    ]);
  });
});
