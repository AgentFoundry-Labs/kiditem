import 'reflect-metadata';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ProductOperationsController } from '../adapter/in/web/product-operations.controller';
import { CategoriesModule } from '../categories.module';
import { CategoriesController } from '../adapter/in/web/category/categories.controller';
import { CoupangCategorySuggestionService } from '../application/service/category/coupang-category-suggestion.service';
import { ProductsModule } from '../products.module';
import { ProductSourceModule } from '../product-source.module';
import { PRODUCT_QUERY_PORT } from '../application/port/in/product-query.port';
import { PRODUCT_METADATA_PORT } from '../application/port/in/product-metadata.port';
import { AnalyticsModule } from '../../analytics/analytics.module';
import { AiModule } from '../../content/ai.module';
import { FinanceModule } from '../../finance/finance.module';
import { ProductAbcController } from '../adapter/in/web/product-abc.controller';
import { MASTER_PRODUCT_ABC_RECALCULATION_PORT } from '../application/port/in/master-product-abc-recalculation.port';
import { RecalculateProductAbcUseCase } from '../application/service/recalculate-product-abc.usecase';
import { ChannelCatalogModule } from '../../channels/channel-catalog.module';
import { CHANNEL_OPTION_RECIPE_PORT } from '../../channels/application/port/in/channel-option-recipe.port';

describe('Products architecture', () => {
  it('publishes the organization-scoped WING category suggestion route', () => {
    const handler = CategoriesController.prototype.suggestCoupangCategories;
    expect(Reflect.getMetadata('path', handler)).toBe('coupang-suggestions');
    expect(Reflect.getMetadata('method', handler)).toBe(RequestMethod.POST);

    const providers = Reflect.getMetadata('providers', CategoriesModule) ?? [];
    expect(providers).toContain(CoupangCategorySuggestionService);
  });

  it('publishes product reads, image edits and explicit source correction', () => {
    expect(Reflect.getMetadata('path', ProductOperationsController)).toBe('products');
    const routes = [
      ['listProducts', 'masters', RequestMethod.GET],
      ['getDataStatus', 'masters/data-status', RequestMethod.GET],
      ['getProduct', 'masters/:masterProductId', RequestMethod.GET],
      ['updateProduct', 'masters/:masterProductId', RequestMethod.PATCH],
      ['correctSourceBinding', 'masters/:masterProductId/source-binding', RequestMethod.PATCH],
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
      useExisting: RecalculateProductAbcUseCase,
    });
    expect(exports).not.toContain(MASTER_PRODUCT_ABC_RECALCULATION_PORT);
  });

  it('owns the Categories compatibility module', () => {
    const imports = Reflect.getMetadata('imports', ProductsModule) ?? [];
    expect(imports).toContain(CategoriesModule);
    expect(imports).toContain(ProductSourceModule);
    expect(imports).toContain(AnalyticsModule);
    expect(imports).toContain(AiModule);
    expect(imports).toContain(FinanceModule);
    expect(imports).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'OperationsModule' }),
    ]));
    const providers = Reflect.getMetadata('providers', ProductsModule) ?? [];
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
    expect(exports).toContain(PRODUCT_QUERY_PORT);
    expect(exports).toContain(PRODUCT_METADATA_PORT);
    expect(exports.some((value: unknown) => typeof value === 'function')).toBe(false);
    expect(exports.map(String)).not.toContain('ProductRecipeComponentCandidateService');
  });

  it('publishes the focused recipe mutation owner port', () => {
    const imports = Reflect.getMetadata('imports', ProductsModule) ?? [];
    const exports = Reflect.getMetadata('exports', ChannelCatalogModule) ?? [];
    expect(imports).toContain(ChannelCatalogModule);
    expect(exports).toContain(CHANNEL_OPTION_RECIPE_PORT);
  });

});
