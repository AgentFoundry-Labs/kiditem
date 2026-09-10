import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { FinanceModule } from '../finance/finance.module';
import { AiModule } from '../ai/ai.module';
import { ProductOperationsController } from './adapter/in/http/product-operations.controller';
import { ProductAbcController } from './adapter/in/http/product-abc.controller';
import { ProductOperationsRepositoryAdapter } from './adapter/out/repository/product-operations.repository.adapter';
import { PRODUCT_OPERATIONS_REPOSITORY_PORT } from './application/port/out/repository/product-operations.repository.port';
import { ProductOperationsService } from './application/service/product-operations.service';
import { ProductRecipeComponentCandidateService } from './application/service/product-recipe-component-candidate.service';
import { CategoriesModule } from './categories/categories.module';
import { MasterProductAbcService } from './application/service/master-product-abc.service';
import { MASTER_PRODUCT_ABC_RECALCULATION_PORT } from './application/port/in/master-product-abc-recalculation.port';
import { ProductAbcReadModule } from './product-abc-read.module';
import { ProductOperationsDataStatusService } from './application/service/product-operations-data-status.service';
import { ProductOperationsDataStatusRepositoryAdapter } from './adapter/out/repository/product-operations-data-status.repository.adapter';
import { PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT } from './application/port/out/repository/product-operations-data-status.repository.port';
import { ProductsListingGenerationCapabilityAdapter } from './adapter/in/agent/products-listing-generation-capability.adapter';
import { ProductsCapabilityCompositionAdapter } from './adapter/in/agent/products-capability-composition.adapter';
import { PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT } from './application/port/in/capability/listing-generation.port';
import { PRODUCTS_CAPABILITY_COMPOSITION_PORT } from './application/port/in/capability/products-capability-composition.port';

@Module({
  imports: [
    CategoriesModule,
    InventoryModule,
    AnalyticsModule,
    FinanceModule,
    AiModule,
    ProductAbcReadModule,
  ],
  controllers: [ProductAbcController, ProductOperationsController],
  providers: [
    ProductOperationsService,
    ProductOperationsDataStatusService,
    ProductOperationsDataStatusRepositoryAdapter,
    ProductRecipeComponentCandidateService,
    MasterProductAbcService,
    ProductsListingGenerationCapabilityAdapter,
    ProductsCapabilityCompositionAdapter,
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
      provide: MASTER_PRODUCT_ABC_RECALCULATION_PORT,
      useExisting: MasterProductAbcService,
    },
    { provide: PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT, useExisting: ProductsListingGenerationCapabilityAdapter },
    { provide: PRODUCTS_CAPABILITY_COMPOSITION_PORT, useExisting: ProductsCapabilityCompositionAdapter },
  ],
  exports: [
    ProductOperationsService,
    PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT,
    PRODUCTS_CAPABILITY_COMPOSITION_PORT,
  ],
})
export class ProductsModule {}
