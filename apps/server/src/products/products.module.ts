import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ProductOperationsController } from './adapter/in/http/product-operations.controller';
import { ChannelCatalogProductProvisioningRepositoryAdapter } from './adapter/out/repository/channel-catalog-product-provisioning.repository.adapter';
import { ProductOperationsRepositoryAdapter } from './adapter/out/repository/product-operations.repository.adapter';
import { CHANNEL_CATALOG_PRODUCT_PROVISIONING_PORT } from './application/port/in/channel-catalog-product-provisioning.port';
import { CHANNEL_CATALOG_PRODUCT_PROVISIONING_REPOSITORY_PORT } from './application/port/out/repository/channel-catalog-product-provisioning.repository.port';
import { PRODUCT_OPERATIONS_REPOSITORY_PORT } from './application/port/out/repository/product-operations.repository.port';
import { ChannelCatalogProductProvisioningService } from './application/service/channel-catalog-product-provisioning.service';
import { ProductOperationsService } from './application/service/product-operations.service';
import { ProductRecipeComponentCandidateService } from './application/service/product-recipe-component-candidate.service';
import { ProductVariantRecipeService } from './application/service/product-variant-recipe.service';
import { CategoriesModule } from './categories/categories.module';
import { PRODUCT_VARIANT_RECIPE_AUTOMATION_PORT } from './application/port/in/product-variant-recipe-automation.port';
import { ProductVariantRecipeAutomationService } from './application/service/product-variant-recipe-automation.service';

@Module({
  imports: [CategoriesModule, InventoryModule, AnalyticsModule],
  controllers: [ProductOperationsController],
  providers: [
    ProductOperationsService,
    ProductRecipeComponentCandidateService,
    ProductVariantRecipeService,
    ProductVariantRecipeAutomationService,
    ChannelCatalogProductProvisioningService,
    ChannelCatalogProductProvisioningRepositoryAdapter,
    {
      provide: CHANNEL_CATALOG_PRODUCT_PROVISIONING_REPOSITORY_PORT,
      useExisting: ChannelCatalogProductProvisioningRepositoryAdapter,
    },
    {
      provide: CHANNEL_CATALOG_PRODUCT_PROVISIONING_PORT,
      useExisting: ChannelCatalogProductProvisioningService,
    },
    ProductOperationsRepositoryAdapter,
    {
      provide: PRODUCT_OPERATIONS_REPOSITORY_PORT,
      useExisting: ProductOperationsRepositoryAdapter,
    },
    {
      provide: PRODUCT_VARIANT_RECIPE_AUTOMATION_PORT,
      useExisting: ProductVariantRecipeAutomationService,
    },
  ],
  exports: [
    ProductOperationsService,
    ProductVariantRecipeService,
    CHANNEL_CATALOG_PRODUCT_PROVISIONING_PORT,
    PRODUCT_VARIANT_RECIPE_AUTOMATION_PORT,
  ],
})
export class ProductsModule {}
