import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { FinanceModule } from '../finance/finance.module';
import { AiModule } from '../ai/ai.module';
import { ProductOperationsController } from './adapter/in/http/product-operations.controller';
import { ProductOperationsRepositoryAdapter } from './adapter/out/repository/product-operations.repository.adapter';
import { PRODUCT_OPERATIONS_REPOSITORY_PORT } from './application/port/out/repository/product-operations.repository.port';
import { ProductOperationsService } from './application/service/product-operations.service';
import { ProductRecipeComponentCandidateService } from './application/service/product-recipe-component-candidate.service';
import { CategoriesModule } from './categories/categories.module';
import { MasterProductAbcService } from './application/service/master-product-abc.service';
import { MasterProductAbcRepositoryAdapter } from './adapter/out/repository/master-product-abc.repository.adapter';
import { MASTER_PRODUCT_ABC_REPOSITORY_PORT } from './application/port/out/repository/master-product-abc.repository.port';
import { OperationsModule } from '../operations/operations.module';
import { ProductOperationsDataStatusService } from './application/service/product-operations-data-status.service';
import { ProductOperationsDataStatusRepositoryAdapter } from './adapter/out/repository/product-operations-data-status.repository.adapter';
import { PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT } from './application/port/out/repository/product-operations-data-status.repository.port';
import {
  ProductProfitabilityAbcOperationHandler,
  ProductProfitabilityRefreshOperationHandler,
} from './adapter/in/operation/product-profitability.operation-handler';
import { MasterProductInventoryActivityListener } from './adapter/in/event/master-product-inventory-activity.listener';
import { ProductsListingGenerationCapabilityAdapter } from './adapter/in/agent/products-listing-generation-capability.adapter';
import { PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT } from './application/port/in/capability/listing-generation.port';
import { SourcingAgentListingCapabilityModule } from '../sourcing/sourcing-agent-listing-capability.module';

@Module({
  imports: [CategoriesModule, InventoryModule, AnalyticsModule, FinanceModule, AiModule, OperationsModule, SourcingAgentListingCapabilityModule],
  controllers: [ProductOperationsController],
  providers: [
    ProductOperationsService,
    ProductOperationsDataStatusService,
    ProductOperationsDataStatusRepositoryAdapter,
    ProductProfitabilityRefreshOperationHandler,
    ProductProfitabilityAbcOperationHandler,
    ProductRecipeComponentCandidateService,
    MasterProductAbcService,
    MasterProductInventoryActivityListener,
    ProductsListingGenerationCapabilityAdapter,
    MasterProductAbcRepositoryAdapter,
    ProductOperationsRepositoryAdapter,
    {
      provide: PRODUCT_OPERATIONS_REPOSITORY_PORT,
      useExisting: ProductOperationsRepositoryAdapter,
    },
    {
      provide: PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT,
      useExisting: ProductOperationsDataStatusRepositoryAdapter,
    },
    {
      provide: MASTER_PRODUCT_ABC_REPOSITORY_PORT,
      useExisting: MasterProductAbcRepositoryAdapter,
    },
    { provide: PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT, useExisting: ProductsListingGenerationCapabilityAdapter },
  ],
  exports: [
    ProductOperationsService,
    PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT,
  ],
})
export class ProductsModule {}
