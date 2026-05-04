// apps/server/src/products/products.module.ts
import { Module } from '@nestjs/common';
import { MasterCodeService } from './adapter/out/prisma/master-code.service';
import { MastersService } from './application/service/masters.service';
import { OptionsService } from './application/service/options.service';
import { BundleStockService } from './application/service/bundle-stock.service';
import { BundleComponentsService } from './application/service/bundle-components.service';
import { ProductCatalogService } from './application/service/product-catalog.service';
import { MastersController } from './adapter/in/http/masters.controller';
import { OptionsController } from './adapter/in/http/options.controller';
import { BundleComponentsController } from './adapter/in/http/bundle-components.controller';
import { ProductCatalogController } from './adapter/in/http/product-catalog.controller';
import { ProductContentController } from './adapter/in/http/product-content.controller';
import { ProductsLegacyController } from './adapter/in/http/products-legacy.controller';
import { CategoriesModule } from './categories/categories.module';

@Module({
  imports: [CategoriesModule],
  controllers: [
    MastersController,
    OptionsController,
    BundleComponentsController,
    ProductCatalogController,
    ProductContentController, // detail-page preview/history/edited-html
    ProductsLegacyController, // last — resolves after sibling /products/* controllers
  ],
  providers: [
    MasterCodeService, MastersService, OptionsService,
    BundleStockService, BundleComponentsService,
    ProductCatalogService,
  ],
  exports: [
    MastersService, OptionsService, BundleComponentsService,
    BundleStockService, ProductCatalogService,
  ],
})
export class ProductsModule {}
