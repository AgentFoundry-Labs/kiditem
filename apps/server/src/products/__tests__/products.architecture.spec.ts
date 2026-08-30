import 'reflect-metadata';
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
import { OperationsModule } from '../../operations/operations.module';

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

  it('owns the Categories compatibility module', () => {
    const imports = Reflect.getMetadata('imports', ProductsModule) ?? [];
    expect(imports).toContain(CategoriesModule);
    expect(imports).toContain(InventoryModule);
    expect(imports).toContain(AnalyticsModule);
    expect(imports).toContain(AiModule);
    expect(imports).toContain(FinanceModule);
    expect(imports).toContain(OperationsModule);
    const providers = Reflect.getMetadata('providers', ProductsModule) ?? [];
    expect(providers).toContain(ProductRecipeComponentCandidateService);
  });

  it('does not export internal inventory-recipe adapters', () => {
    const exports = Reflect.getMetadata('exports', ProductsModule) ?? [];
    expect(exports.some((value: unknown) => typeof value === 'function')).toBe(true);
    expect(exports.map(String)).not.toContain('ProductRecipeComponentCandidateService');
  });

});
