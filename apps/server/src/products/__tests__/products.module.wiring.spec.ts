import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ProductsModule } from '../products.module';
import { MasterCodeRepositoryAdapter } from '../adapter/out/repository/master-code.repository.adapter';
import { MasterProductRepositoryAdapter } from '../adapter/out/repository/master-product.repository.adapter';
import { ProductOptionRepositoryAdapter } from '../adapter/out/repository/product-option.repository.adapter';
import { BundleRepositoryAdapter } from '../adapter/out/repository/bundle.repository.adapter';
import { ProductCatalogRepositoryAdapter } from '../adapter/out/repository/product-catalog.repository.adapter';
import { ProductManagementRepositoryAdapter } from '../adapter/out/repository/product-management.repository.adapter';
import { ProductsTransactionAdapter } from '../adapter/out/repository/products-transaction.adapter';
import { MASTER_CODE_PORT } from '../application/port/out/repository/master-code.port';
import { MASTER_PRODUCT_REPOSITORY_PORT } from '../application/port/out/repository/master-product.repository.port';
import { PRODUCT_OPTION_REPOSITORY_PORT } from '../application/port/out/repository/product-option.repository.port';
import { PRODUCT_BUNDLE_REPOSITORY_PORT } from '../application/port/out/repository/product-bundle.repository.port';
import { PRODUCT_CATALOG_REPOSITORY_PORT } from '../application/port/out/repository/product-catalog.repository.port';
import { PRODUCT_MANAGEMENT_REPOSITORY_PORT } from '../application/port/out/repository/product-management.repository.port';
import { PRODUCTS_TRANSACTION_PORT } from '../application/port/out/transaction/products-transaction.port';
import { PRODUCT_MASTER_BARCODE_PORT } from '../application/port/in/master-barcode.port';
import { PRODUCT_MASTER_PROMOTION_PORT } from '../application/port/in/master-promotion.port';
import { PRODUCT_OPTION_PROVISION_PORT } from '../application/port/in/product-option-provision.port';
import { MasterBarcodeService } from '../application/service/master-barcode.service';
import { MasterPromotionService } from '../application/service/master-promotion.service';
import { ProductOptionProvisionService } from '../application/service/product-option-provision.service';

const PROVIDERS_KEY = 'providers';

function expectBinding(providers: unknown[], token: symbol, adapter: unknown) {
  const binding = providers.find(
    (provider): provider is { provide: symbol; useExisting: unknown } =>
      typeof provider === 'object' &&
      provider !== null &&
      (provider as { provide?: unknown }).provide === token,
  );
  expect(binding).toBeDefined();
  expect(binding!.useExisting).toBe(adapter);
}

describe('ProductsModule canonical owner wiring', () => {
  it('binds outgoing repository ports to local adapters', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, ProductsModule) ?? [];

    expect(providers).toContain(MasterCodeRepositoryAdapter);
    expect(providers).toContain(MasterProductRepositoryAdapter);
    expect(providers).toContain(ProductOptionRepositoryAdapter);
    expect(providers).toContain(BundleRepositoryAdapter);
    expect(providers).toContain(ProductCatalogRepositoryAdapter);
    expect(providers).toContain(ProductManagementRepositoryAdapter);
    expect(providers).toContain(ProductsTransactionAdapter);

    expectBinding(providers, MASTER_CODE_PORT, MasterCodeRepositoryAdapter);
    expectBinding(providers, MASTER_PRODUCT_REPOSITORY_PORT, MasterProductRepositoryAdapter);
    expectBinding(providers, PRODUCT_OPTION_REPOSITORY_PORT, ProductOptionRepositoryAdapter);
    expectBinding(providers, PRODUCT_BUNDLE_REPOSITORY_PORT, BundleRepositoryAdapter);
    expectBinding(providers, PRODUCT_CATALOG_REPOSITORY_PORT, ProductCatalogRepositoryAdapter);
    expectBinding(providers, PRODUCT_MANAGEMENT_REPOSITORY_PORT, ProductManagementRepositoryAdapter);
    expectBinding(providers, PRODUCTS_TRANSACTION_PORT, ProductsTransactionAdapter);
  });

  it('keeps products owner-side incoming ports exported through application services', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, ProductsModule) ?? [];

    expectBinding(providers, PRODUCT_MASTER_PROMOTION_PORT, MasterPromotionService);
    expectBinding(providers, PRODUCT_OPTION_PROVISION_PORT, ProductOptionProvisionService);
    expectBinding(providers, PRODUCT_MASTER_BARCODE_PORT, MasterBarcodeService);
  });
});
