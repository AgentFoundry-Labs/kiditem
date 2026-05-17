import { Module } from '@nestjs/common';
import { MasterCodeService } from './adapter/out/prisma/master-code.service';
import { MastersService } from './application/service/masters.service';
import { MasterPromotionService } from './application/service/master-promotion.service';
import { OptionsService } from './application/service/options.service';
import { BundleStockService } from './application/service/bundle-stock.service';
import { BundleComponentsService } from './application/service/bundle-components.service';
import { ProductCatalogService } from './application/service/product-catalog.service';
import { ProductManagementEnrichmentService } from './application/service/product-management-enrichment.service';
import { ProductManagementFactsService } from './application/service/product-management-facts.service';
import { ProductManagementGradeService } from './application/service/product-management-grade.service';
import { ProductManagementService } from './application/service/product-management.service';
import { MastersController } from './adapter/in/http/masters.controller';
import { MasterImagesController } from './adapter/in/http/master-images.controller';
import { OptionsController } from './adapter/in/http/options.controller';
import { BundleComponentsController } from './adapter/in/http/bundle-components.controller';
import { ProductCatalogController } from './adapter/in/http/product-catalog.controller';
import { ProductContentController } from './adapter/in/http/product-content.controller';
import { ProductsLegacyController } from './adapter/in/http/products-legacy.controller';
import { CategoriesModule } from './categories/categories.module';
import { PRODUCT_BUNDLE_STOCK_PORT } from './application/port/in/bundle-stock.port';
import { PRODUCT_MASTER_PROMOTION_PORT } from './application/port/in/master-promotion.port';

@Module({
  imports: [CategoriesModule],
  controllers: [
    MastersController,
    MasterImagesController,
    OptionsController,
    BundleComponentsController,
    ProductCatalogController,
    ProductContentController, // generated content cards + detail-page preview/history/edited-html
    ProductsLegacyController, // last — resolves after sibling /products/* controllers
  ],
  providers: [
    MasterCodeService,
    MastersService,
    MasterPromotionService,
    OptionsService,
    BundleStockService,
    BundleComponentsService,
    ProductCatalogService,
    ProductManagementFactsService,
    ProductManagementGradeService,
    ProductManagementEnrichmentService,
    ProductManagementService,
    { provide: PRODUCT_MASTER_PROMOTION_PORT, useExisting: MasterPromotionService },
    { provide: PRODUCT_BUNDLE_STOCK_PORT, useExisting: BundleStockService },
  ],
  exports: [
    PRODUCT_MASTER_PROMOTION_PORT,
    PRODUCT_BUNDLE_STOCK_PORT,
  ],
})
export class ProductsModule {}
