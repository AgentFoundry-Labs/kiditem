import { ChannelCatalogModule } from '../channels/channel-catalog.module';
import { PRODUCT_SOURCE_BINDING_PORT } from './application/port/in/product-source-binding.port';
import { CorrectProductSourceBindingUseCase } from './application/usecase/correct-product-source-binding.usecase';
import { ProductSourceModule } from './product-source.module';
import { PRODUCT_QUERY_PORT } from './application/port/in/product-query.port';
import { PRODUCT_METADATA_PORT } from './application/port/in/product-metadata.port';
import { UpdateProductMetadataUseCase } from './application/usecase/update-product-metadata.usecase';
import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { FinanceModule } from '../finance/finance.module';
import { AiModule } from '../content/ai.module';
import { ProductOperationsController } from './adapter/in/web/product-operations.controller';
import { ProductAbcController } from './adapter/in/web/product-abc.controller';
import { ProductOperationsRepositoryAdapter } from './adapter/out/persistence/product-operations.repository.adapter';
import { PRODUCT_OPERATIONS_REPOSITORY_PORT } from './application/port/out/persistence/product-operations.repository.port';
import { ProductQueryUseCase } from './application/usecase/product-query.usecase';
import { CategoriesModule } from './categories/categories.module';
import { RecalculateProductAbcUseCase } from './application/usecase/recalculate-product-abc.usecase';
import { MASTER_PRODUCT_ABC_RECALCULATION_PORT } from './application/port/in/master-product-abc-recalculation.port';
import { ProductAbcReadModule } from './product-abc-read.module';
import { ProductDataStatusUseCase } from './application/usecase/product-data-status.usecase';
import { ProductOperationsDataStatusRepositoryAdapter } from './adapter/out/persistence/product-operations-data-status.repository.adapter';
import { PRODUCT_OPERATIONS_DATA_STATUS_REPOSITORY_PORT } from './application/port/out/persistence/product-operations-data-status.repository.port';
import { ProductsListingGenerationCapabilityAdapter } from './adapter/in/agent/products-listing-generation-capability.adapter';
import { ProductsCapabilityCompositionAdapter } from './adapter/in/agent/products-capability-composition.adapter';
import { PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT } from './application/port/in/capability/listing-generation.port';
import { PRODUCTS_CAPABILITY_COMPOSITION_PORT } from './application/port/in/capability/products-capability-composition.port';

@Module({
  imports: [ChannelCatalogModule,
    CategoriesModule,
    ProductSourceModule,
    AnalyticsModule,
    FinanceModule,
    AiModule,
    ProductAbcReadModule,
  ],
  controllers: [ProductAbcController, ProductOperationsController],
  providers: [
    CorrectProductSourceBindingUseCase,
    { provide: PRODUCT_SOURCE_BINDING_PORT, useExisting: CorrectProductSourceBindingUseCase },
    UpdateProductMetadataUseCase,
    { provide: PRODUCT_QUERY_PORT, useExisting: ProductQueryUseCase },
    { provide: PRODUCT_METADATA_PORT, useExisting: UpdateProductMetadataUseCase },
    ProductQueryUseCase,
    ProductDataStatusUseCase,
    ProductOperationsDataStatusRepositoryAdapter,
    RecalculateProductAbcUseCase,
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
      useExisting: RecalculateProductAbcUseCase,
    },
    { provide: PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT, useExisting: ProductsListingGenerationCapabilityAdapter },
    { provide: PRODUCTS_CAPABILITY_COMPOSITION_PORT, useExisting: ProductsCapabilityCompositionAdapter },
  ],
  exports: [
    PRODUCT_SOURCE_BINDING_PORT,
    PRODUCT_QUERY_PORT,
    PRODUCT_METADATA_PORT,
    PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT,
    PRODUCTS_CAPABILITY_COMPOSITION_PORT,
  ],
})
export class ProductsModule {}
