import { ChannelCatalogModule } from '../channels/channel-catalog.module';
import { AiListingContentQueryModule } from '../ai/ai-listing-content-query.module';
import { Module } from '@nestjs/common';
import { AdvertisingModule } from '../advertising/advertising.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ChannelsModule } from '../channels/channels.module';
import { ProductCollectionRuntimeModule } from '../products/product-collection-runtime.module';
import { ProductSourceModule } from '../products/product-source.module';
import { FinanceReportExportController } from './controllers/finance-report-export.controller';
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
import { ProfitabilityEvidenceModule } from './profitability-evidence.module';
import { MasterProductContributionRepositoryAdapter } from './adapter/out/repository/master-product-contribution.repository.adapter';
import { MASTER_PRODUCT_CONTRIBUTION_READ_PORT } from './application/port/in/master-product-contribution-read.port';
import { MASTER_PRODUCT_CONTRIBUTION_REPOSITORY_PORT } from './application/port/out/repository/master-product-contribution.repository.port';
import { MasterProductContributionReadService } from './application/service/master-product-contribution-read.service';
import { FinanceReportExportService } from './report-export/finance-report-export.service';

@Module({
  imports: [AiListingContentQueryModule, ChannelCatalogModule,
    AnalyticsModule,
    AdvertisingModule,
    ChannelsModule,
    ProductCollectionRuntimeModule,
    ProductSourceModule,
    ProfitabilityEvidenceModule,
  ],
  controllers: [
    ProfitLossController,
    FinanceReportExportController,
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
    FinanceReportExportService,
    {
      provide: MASTER_PRODUCT_CONTRIBUTION_REPOSITORY_PORT,
      useExisting: MasterProductContributionRepositoryAdapter,
    },
    {
      provide: MASTER_PRODUCT_CONTRIBUTION_READ_PORT,
      useExisting: MasterProductContributionReadService,
    },
  ],
  exports: [ProfitabilityEvidenceModule, MASTER_PRODUCT_CONTRIBUTION_READ_PORT],
})
export class FinanceModule {}
