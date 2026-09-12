import 'reflect-metadata';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ProductOperationsController } from '../adapter/in/http/product-operations.controller';
import { ProductRecipeComponentCandidateService } from '../application/service/product-recipe-component-candidate.service';
import { CategoriesModule } from '../categories/categories.module';
import { CategoriesController } from '../categories/categories.controller';
import { CoupangCategorySuggestionService } from '../categories/coupang-category-suggestion.service';
import { ProductsModule } from '../products.module';
import { InventoryModule } from '../../inventory/inventory.module';
import { AnalyticsModule } from '../../analytics/analytics.module';
import { AiModule } from '../../ai/ai.module';
import { FinanceModule } from '../../finance/finance.module';
import { ProductAbcController } from '../adapter/in/http/product-abc.controller';
import { MASTER_PRODUCT_ABC_RECALCULATION_PORT } from '../application/port/in/master-product-abc-recalculation.port';
import { MasterProductAbcService } from '../application/service/master-product-abc.service';
import { ProductRecipeMutationModule } from '../product-recipe-mutation.module';
import { PRODUCT_CHANNEL_OPTION_RECIPE_MUTATION_PORT } from '../application/port/in/product-channel-option-recipe-mutation.port';

describe('Products architecture', () => {
  it('publishes the organization-scoped WING category suggestion route', () => {
    const handler = CategoriesController.prototype.suggestCoupangCategories;
    expect(Reflect.getMetadata('path', handler)).toBe('coupang-suggestions');
    expect(Reflect.getMetadata('method', handler)).toBe(RequestMethod.POST);

    const providers = Reflect.getMetadata('providers', CategoriesModule) ?? [];
    expect(providers).toContain(CoupangCategorySuggestionService);
  });

  it('publishes the direct master-product and channel-option routes', () => {
    expect(Reflect.getMetadata('path', ProductOperationsController)).toBe('products');
    const routes = [
      ['listProducts', 'masters', RequestMethod.GET],
      ['getDataStatus', 'masters/data-status', RequestMethod.GET],
      ['listRecipeComponentCandidates', 'recipe-component-candidates', RequestMethod.GET],
      ['createProduct', 'masters', RequestMethod.POST],
      ['getProduct', 'masters/:masterProductId', RequestMethod.GET],
      ['updateProduct', 'masters/:masterProductId', RequestMethod.PATCH],
      ['replaceChannelOptionInventory', 'channel-options/:channelListingOptionId/inventory-components', RequestMethod.PUT],
    ] as const;

    for (const [methodName, path, method] of routes) {
      const handler = ProductOperationsController.prototype[methodName];
      expect(Reflect.getMetadata('path', handler)).toBe(path);
      expect(Reflect.getMetadata('method', handler)).toBe(method);
    }
  });

  it('keeps the explicit ABC command inside the Products HTTP boundary', () => {
    const controllers = Reflect.getMetadata('controllers', ProductsModule) ?? [];
    const providers = Reflect.getMetadata('providers', ProductsModule) ?? [];
    const exports = Reflect.getMetadata('exports', ProductsModule) ?? [];

    expect(controllers).toContain(ProductAbcController);
    expect(providers).toContainEqual({
      provide: MASTER_PRODUCT_ABC_RECALCULATION_PORT,
      useExisting: MasterProductAbcService,
    });
    expect(exports).not.toContain(MASTER_PRODUCT_ABC_RECALCULATION_PORT);
  });

  it('owns the Categories compatibility module', () => {
    const imports = Reflect.getMetadata('imports', ProductsModule) ?? [];
    expect(imports).toContain(CategoriesModule);
    expect(imports).toContain(InventoryModule);
    expect(imports).toContain(AnalyticsModule);
    expect(imports).toContain(AiModule);
    expect(imports).toContain(FinanceModule);
    expect(imports).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'OperationsModule' }),
    ]));
    const providers = Reflect.getMetadata('providers', ProductsModule) ?? [];
    expect(providers).toContain(ProductRecipeComponentCandidateService);
    expect(providers).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'ProductsListingGenerationOperationHandler' }),
    ]));
  });

  it('does not retain the generic listing-generation Operation adapter', () => {
    const productsRoot = path.resolve(__dirname, '..');
    expect(existsSync(path.join(
      productsRoot,
      'adapter/in/operation/listing-generation.operation-handler.ts',
    ))).toBe(false);
    expect(existsSync(path.join(
      productsRoot,
      'domain/operation/listing-generation.operations.ts',
    ))).toBe(false);
  });

  it('does not export internal inventory-recipe adapters', () => {
    const exports = Reflect.getMetadata('exports', ProductsModule) ?? [];
    expect(exports.some((value: unknown) => typeof value === 'function')).toBe(true);
    expect(exports.map(String)).not.toContain('ProductRecipeComponentCandidateService');
  });

  it('publishes the focused recipe mutation owner port', () => {
    const imports = Reflect.getMetadata('imports', ProductsModule) ?? [];
    const exports = Reflect.getMetadata('exports', ProductRecipeMutationModule) ?? [];
    expect(imports).toContain(ProductRecipeMutationModule);
    expect(exports).toContain(PRODUCT_CHANNEL_OPTION_RECIPE_MUTATION_PORT);
  });

});
