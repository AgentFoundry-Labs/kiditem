import { Module } from '@nestjs/common';
import { MasterCodeRepositoryAdapter } from './adapter/out/repository/master-code.repository.adapter';
import { MasterProductRepositoryAdapter } from './adapter/out/repository/master-product.repository.adapter';
import { ProductOptionRepositoryAdapter } from './adapter/out/repository/product-option.repository.adapter';
import { BundleRepositoryAdapter } from './adapter/out/repository/bundle.repository.adapter';
import { ProductCatalogRepositoryAdapter } from './adapter/out/repository/product-catalog.repository.adapter';
import { ProductManagementRepositoryAdapter } from './adapter/out/repository/product-management.repository.adapter';
import { ProductsTransactionAdapter } from './adapter/out/repository/products-transaction.adapter';
import { MastersService } from './application/service/masters.service';
import { MasterBarcodeService } from './application/service/master-barcode.service';
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
import { PRODUCT_MASTER_BARCODE_PORT } from './application/port/in/master-barcode.port';
import { PRODUCT_MASTER_PROMOTION_PORT } from './application/port/in/master-promotion.port';
import { MASTER_CODE_PORT } from './application/port/out/master-code.port';
import { MASTER_PRODUCT_REPOSITORY_PORT } from './application/port/out/master-product.repository.port';
import { PRODUCT_OPTION_REPOSITORY_PORT } from './application/port/out/product-option.repository.port';
import { PRODUCT_BUNDLE_REPOSITORY_PORT } from './application/port/out/product-bundle.repository.port';
import { PRODUCT_CATALOG_REPOSITORY_PORT } from './application/port/out/product-catalog.repository.port';
import { PRODUCT_MANAGEMENT_REPOSITORY_PORT } from './application/port/out/product-management.repository.port';
import { PRODUCTS_TRANSACTION_PORT } from './application/port/out/products-transaction.port';

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
    MasterCodeRepositoryAdapter,
    MasterProductRepositoryAdapter,
    ProductOptionRepositoryAdapter,
    BundleRepositoryAdapter,
    ProductCatalogRepositoryAdapter,
    ProductManagementRepositoryAdapter,
    ProductsTransactionAdapter,
    MastersService,
    MasterBarcodeService,
    MasterPromotionService,
    OptionsService,
    BundleStockService,
    BundleComponentsService,
    ProductCatalogService,
    ProductManagementFactsService,
    ProductManagementGradeService,
    ProductManagementEnrichmentService,
    ProductManagementService,
    { provide: MASTER_CODE_PORT, useExisting: MasterCodeRepositoryAdapter },
    { provide: MASTER_PRODUCT_REPOSITORY_PORT, useExisting: MasterProductRepositoryAdapter },
    { provide: PRODUCT_OPTION_REPOSITORY_PORT, useExisting: ProductOptionRepositoryAdapter },
    { provide: PRODUCT_BUNDLE_REPOSITORY_PORT, useExisting: BundleRepositoryAdapter },
    { provide: PRODUCT_CATALOG_REPOSITORY_PORT, useExisting: ProductCatalogRepositoryAdapter },
    { provide: PRODUCT_MANAGEMENT_REPOSITORY_PORT, useExisting: ProductManagementRepositoryAdapter },
    { provide: PRODUCTS_TRANSACTION_PORT, useExisting: ProductsTransactionAdapter },
    { provide: PRODUCT_MASTER_BARCODE_PORT, useExisting: MasterBarcodeService },
    { provide: PRODUCT_MASTER_PROMOTION_PORT, useExisting: MasterPromotionService },
    { provide: PRODUCT_BUNDLE_STOCK_PORT, useExisting: BundleStockService },
  ],
  exports: [
    PRODUCT_MASTER_BARCODE_PORT,
    PRODUCT_MASTER_PROMOTION_PORT,
    PRODUCT_BUNDLE_STOCK_PORT,
  ],
})
export class ProductsModule {}
