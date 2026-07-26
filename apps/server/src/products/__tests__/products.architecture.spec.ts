import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ProductOperationsController } from '../adapter/in/http/product-operations.controller';
import { ProductRecipeComponentCandidateService } from '../application/service/product-recipe-component-candidate.service';
import { ChannelCatalogProductProvisioningRepositoryAdapter } from '../adapter/out/repository/channel-catalog-product-provisioning.repository.adapter';
import { CHANNEL_CATALOG_PRODUCT_PROVISIONING_PORT } from '../application/port/in/channel-catalog-product-provisioning.port';
import { CHANNEL_CATALOG_PRODUCT_PROVISIONING_REPOSITORY_PORT } from '../application/port/out/repository/channel-catalog-product-provisioning.repository.port';
import { ChannelCatalogProductProvisioningService } from '../application/service/channel-catalog-product-provisioning.service';
import { CategoriesModule } from '../categories/categories.module';
import { CategoriesController } from '../categories/categories.controller';
import { CoupangCategorySuggestionService } from '../categories/coupang-category-suggestion.service';
import { ProductsModule } from '../products.module';
import { InventoryModule } from '../../inventory/inventory.module';
import { AnalyticsModule } from '../../analytics/analytics.module';
import { AiModule } from '../../ai/ai.module';
import { PRODUCT_VARIANT_RECIPE_AUTOMATION_PORT } from '../application/port/in/product-variant-recipe-automation.port';
import { ProductVariantRecipeAutomationService } from '../application/service/product-variant-recipe-automation.service';

describe('Products architecture', () => {
  it('publishes the organization-scoped WING category suggestion route', () => {
    const handler = CategoriesController.prototype.suggestCoupangCategories;
    expect(Reflect.getMetadata('path', handler)).toBe('coupang-suggestions');
    expect(Reflect.getMetadata('method', handler)).toBe(RequestMethod.POST);

    const providers = Reflect.getMetadata('providers', CategoriesModule) ?? [];
    expect(providers).toContain(CoupangCategorySuggestionService);
  });

  it('publishes the ten product-operation routes', () => {
    expect(Reflect.getMetadata('path', ProductOperationsController)).toBe('products');
    const routes = [
      ['listProducts', 'masters', RequestMethod.GET],
      ['listRecipeComponentCandidates', 'recipe-component-candidates', RequestMethod.GET],
      ['createProduct', 'masters', RequestMethod.POST],
      ['getProduct', 'masters/:masterProductId', RequestMethod.GET],
      ['updateProduct', 'masters/:masterProductId', RequestMethod.PATCH],
      ['createVariant', 'masters/:masterProductId/variants', RequestMethod.POST],
      ['updateVariant', 'variants/:productVariantId', RequestMethod.PATCH],
      ['replaceRecipe', 'variants/:productVariantId/components', RequestMethod.PUT],
      ['planRecipesIfEmpty', 'variant-recipes/create-if-empty/plan', RequestMethod.POST],
      ['createRecipesIfEmpty', 'variant-recipes/create-if-empty', RequestMethod.POST],
    ] as const;

    for (const [methodName, path, method] of routes) {
      const handler = ProductOperationsController.prototype[methodName];
      expect(Reflect.getMetadata('path', handler)).toBe(path);
      expect(Reflect.getMetadata('method', handler)).toBe(method);
    }
  });

  it('owns the Categories compatibility module', () => {
    const imports = Reflect.getMetadata('imports', ProductsModule) ?? [];
    expect(imports).toContain(CategoriesModule);
    expect(imports).toContain(InventoryModule);
    expect(imports).toContain(AnalyticsModule);
    expect(imports).toContain(AiModule);
    const providers = Reflect.getMetadata('providers', ProductsModule) ?? [];
    expect(providers).toContain(ProductRecipeComponentCandidateService);
  });

  it('exports the channel-catalog provisioning port with Products-owned bindings', () => {
    const providers = Reflect.getMetadata('providers', ProductsModule) ?? [];
    expect(providers).toContain(ChannelCatalogProductProvisioningRepositoryAdapter);
    expect(providers).toContain(ChannelCatalogProductProvisioningService);
    expect(providers).toContainEqual({
      provide: CHANNEL_CATALOG_PRODUCT_PROVISIONING_REPOSITORY_PORT,
      useExisting: ChannelCatalogProductProvisioningRepositoryAdapter,
    });
    expect(providers).toContainEqual({
      provide: CHANNEL_CATALOG_PRODUCT_PROVISIONING_PORT,
      useExisting: ChannelCatalogProductProvisioningService,
    });

    const exports = Reflect.getMetadata('exports', ProductsModule) ?? [];
    expect(exports).toContain(CHANNEL_CATALOG_PRODUCT_PROVISIONING_PORT);
    expect(exports).not.toContain(ChannelCatalogProductProvisioningService);
    expect(exports).not.toContain(ChannelCatalogProductProvisioningRepositoryAdapter);
    expect(exports).not.toContain(CHANNEL_CATALOG_PRODUCT_PROVISIONING_REPOSITORY_PORT);
  });

  it('exports the Products-owned deterministic recipe capability', () => {
    const providers = Reflect.getMetadata('providers', ProductsModule) ?? [];
    expect(providers).toContain(ProductVariantRecipeAutomationService);
    expect(providers).toContainEqual({
      provide: PRODUCT_VARIANT_RECIPE_AUTOMATION_PORT,
      useExisting: ProductVariantRecipeAutomationService,
    });
    const exports = Reflect.getMetadata('exports', ProductsModule) ?? [];
    expect(exports).toContain(PRODUCT_VARIANT_RECIPE_AUTOMATION_PORT);
    expect(exports).not.toContain(ProductVariantRecipeAutomationService);
  });
});
