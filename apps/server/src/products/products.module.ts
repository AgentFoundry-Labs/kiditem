// apps/server/src/products/products.module.ts
import { Module } from '@nestjs/common';
import { MasterCodeService } from './services/master-code.service';
import { MastersService } from './services/masters.service';
import { OptionsService } from './services/options.service';
import { BundleStockService } from './services/bundle-stock.service';
import { BundleComponentsService } from './services/bundle-components.service';
import { ProductCatalogService } from './services/product-catalog.service';
import { MastersController } from './controllers/masters.controller';
import { OptionsController } from './controllers/options.controller';
import { BundleComponentsController } from './controllers/bundle-components.controller';
import { ProductCatalogController } from './controllers/product-catalog.controller';
import { ProductsLegacyController } from './controllers/products-legacy.controller';

@Module({
  controllers: [
    MastersController,
    OptionsController,
    BundleComponentsController,
    ProductCatalogController,
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
