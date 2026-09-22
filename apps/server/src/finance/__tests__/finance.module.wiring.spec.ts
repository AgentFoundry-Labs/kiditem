import { AiListingContentQueryModule } from '../../content/ai-listing-content-query.module';
import { ChannelCatalogModule } from '../../channels/channel-catalog.module';
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AdvertisingModule } from '../../advertising/advertising.module';
import { AnalyticsModule } from '../../analytics/analytics.module';
import { ChannelsModule } from '../../channels/channels.module';
import { ProductCollectionRuntimeModule } from '../../products/product-collection-runtime.module';
import { ProductSourceModule } from '../../products/product-source.module';
import { FinanceReportExportController } from '../controllers/finance-report-export.controller';
import { MasterProductContributionRepositoryAdapter } from '../adapter/out/repository/master-product-contribution.repository.adapter';
import { MASTER_PRODUCT_CONTRIBUTION_READ_PORT } from '../application/port/in/master-product-contribution-read.port';
import { MASTER_PRODUCT_CONTRIBUTION_REPOSITORY_PORT } from '../application/port/out/repository/master-product-contribution.repository.port';
import { MasterProductContributionReadService } from '../application/service/master-product-contribution-read.service';
import { ProfitLossController } from '../controllers/profit-loss.controller';
import { SalesAnalysisController } from '../controllers/sales-analysis.controller';
import { FinanceModule } from '../finance.module';
import { ProfitabilityEvidenceModule } from '../profitability-evidence.module';
import { SalesPlansController } from '../sales-plans/sales-plans.controller';
import { SalesPlansService } from '../sales-plans/sales-plans.service';
import { ProfitLossService } from '../services/profit-loss.service';
import { SalesAnalysisScraperService } from '../services/sales-analysis-scraper.service';
import { SalesAnalysisService } from '../services/sales-analysis.service';
import { SettlementsController } from '../settlements/settlements.controller';
import { SettlementsService } from '../settlements/settlements.service';
import { FinanceReportExportService } from '../report-export/finance-report-export.service';
import { SupplierPaymentsController } from '../supplier-payments/supplier-payments.controller';
import { SupplierPaymentsService } from '../supplier-payments/supplier-payments.service';

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
