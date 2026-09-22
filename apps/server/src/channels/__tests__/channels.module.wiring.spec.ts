import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { InventoryModule } from '../../inventory/inventory.module';
import { AlertsModule } from '../../alerts/alerts.module';
import { ChannelsModule } from '../channels.module';
import { ChannelCatalogModule } from '../channel-catalog.module';
import { SalesProductModule } from '../sales-product.module';
import { CHANNEL_DOCUMENT_EXPORT_PORT } from '../application/port/in/registration/channel-document-export.port';
import { ChannelAccountPersistenceAdapter } from '../adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelIntegrityAdapter } from '../adapter/out/integrity/channel-integrity.adapter';
import { ChannelActivityAdapter } from '../adapter/out/alerts/channel-activity.adapter';
import { ChannelsDocumentsAdapter } from '../adapter/out/documents/channel-documents.adapter';
import { ProductAvailabilityAdapter } from '../adapter/out/products/product-availability.adapter';
import { ChannelDashboardRepositoryAdapter } from '../adapter/out/repository/channel-dashboard.repository.adapter';
import { ChannelListingRepositoryAdapter } from '../adapter/out/repository/channel-listing.repository.adapter';
import { ListingRegistrationPersistenceAdapter } from '../adapter/out/persistence/listing-registration.persistence.adapter';
import { ChannelRegistrationService } from '../application/service/registration/channel-registration.service';
import { ChannelDashboardService } from '../application/service/listing/channel-dashboard.service';
import { ChannelListingDeletionService } from '../application/service/listing/channel-listing-deletion.service';
import { ChannelOptionRecipeCandidateService } from '../application/service/listing/channel-option-recipe-candidate.service';
import { MallPublishingService } from '../application/service/registration/mall-publishing.service';
import { CHANNEL_REGISTRATION_PORT } from '../application/port/in/registration/channel-registration.port';
import { LISTING_REGISTRATION_PERSISTENCE_PORT } from '../application/port/out/persistence/listing-registration.persistence.port';
import {
  CHANNEL_ACCOUNT_PORT,
} from '../application/port/in/account/channel-account.port';
import { CHANNEL_ACCOUNT_PERSISTENCE_PORT } from '../application/port/out/persistence/channel-account.persistence.port';
import { CHANNEL_CREDENTIALS_PORT } from '../application/port/out/credentials/channel-credentials.port';
import { ChannelCredentialsAdapter } from '../adapter/out/credentials/channel-credentials.adapter';
import { ChannelAccountService } from '../application/service/account/channel-account.service';
import { CHANNEL_DOCUMENTS_PORT } from '../application/port/out/documents/channel-documents.port';
import { CHANNEL_ACTIVITY_PORT } from '../application/port/out/alerts/channel-activity.port';
import { CHANNEL_INTEGRITY_PORT } from '../application/port/out/integrity/channel-integrity.port';
import { CHANNEL_DASHBOARD_REPOSITORY_PORT } from '../application/port/out/repository/channel-dashboard.repository.port';
import {
  CHANNEL_LISTING_REPOSITORY_PORT,
} from '../application/port/out/repository/channel-listing.repository.port';
import { ChannelCatalogImportController } from '../adapter/in/web/channel-catalog-import.controller';
import { ChannelCatalogImportRepositoryAdapter } from '../adapter/out/repository/channel-catalog-import.repository.adapter';
import { CHANNEL_CATALOG_IMPORT_PORT } from '../application/port/in/channel-catalog-import.port';
import { CHANNEL_CATALOG_IMPORT_REPOSITORY_PORT } from '../application/port/out/repository/channel-catalog-import.repository.port';
import { CHANNEL_CATALOG_COLLECTION_REPOSITORY_PORT } from '../application/port/out/repository/channel-catalog-collection.repository.port';
import { CHANNEL_CATALOG_PUBLICATION_PORT } from '../application/port/out/repository/channel-catalog-publication.port';
import { CHANNEL_CATALOG_COLLECTION_PORT } from '../application/port/in/channel-catalog-collection.port';
import { ChannelCatalogImportService } from '../application/service/collection/channel-catalog-import.service';
import { ChannelCatalogCollectionService } from '../application/service/collection/channel-catalog-collection.service';
import { ChannelProductMatchingController } from '../adapter/in/web/channel-product-matching.controller';
import { ChannelProductMatchingRepositoryAdapter } from '../adapter/out/repository/channel-product-matching.repository.adapter';
import { ChannelRecipeSuggestionContextRepositoryAdapter } from '../adapter/out/repository/channel-recipe-suggestion-context.repository.adapter';
import { SellpiaManualMatchRepositoryAdapter } from '../adapter/out/repository/sellpia-manual-match.repository.adapter';
import { SellpiaRecipeEvidenceAdapter } from '../adapter/out/inventory/sellpia-recipe-evidence.adapter';
import { ChannelProductMatchingService } from '../application/service/listing/channel-product-matching.service';
import { ChannelRecipeSuggestionService } from '../application/service/listing/channel-recipe-suggestion.service';
import { SellpiaManualMatchService } from '../application/service/listing/sellpia-manual-match.service';
import { CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT } from '../application/port/out/repository/channel-product-matching.repository.port';
import { CATALOG_DISPLAY_MEDIA_PORT } from '../../content/application/port/in/workspace/catalog-display-media.port';
import { PRODUCT_AVAILABILITY_PORT } from '../../products/application/port/in/product-availability.port';
import { CHANNEL_PRODUCT_AVAILABILITY_PORT } from '../application/port/out/products/product-availability.port';
import { CHANNEL_RECIPE_SUGGESTION_CONTEXT_REPOSITORY_PORT } from '../application/port/out/repository/channel-recipe-suggestion-context.repository.port';
import { SELLPIA_MANUAL_MATCH_REPOSITORY_PORT } from '../application/port/out/repository/sellpia-manual-match.repository.port';
import { SELLPIA_RECIPE_EVIDENCE_PORT } from '../application/port/out/cross-domain/sellpia-recipe-evidence.port';
import { ChannelSkuAvailabilityController } from '../adapter/in/web/channel-sku-availability.controller';
import {
  CHANNEL_SKU_AVAILABILITY_PORT,
} from '../application/port/in/channel-sku-availability.port';
import { ChannelSkuAvailabilityService } from '../application/service/listing/channel-sku-availability.service';
import { SabangnetProductImportService } from '../application/service/collection/sabangnet-product-import.service';
import { SalesProductLinkService } from '../application/service/sales-product/sales-product-link.service';
import { SalesProductImageService } from '../application/service/sales-product/sales-product-image.service';
import { SalesProductMallPriceService } from '../application/service/sales-product/sales-product-mall-price.service';
import { SalesProductMallSheetService } from '../application/service/sales-product/sales-product-mall-sheet.service';
import { SalesProductCoupangCatalogService } from '../application/service/sales-product/sales-product-coupang-catalog.service';
import { CoupangWingInventoryExportController } from '../adapter/in/web/coupang-wing-inventory-export.controller';
import { CoupangWingRegistrationExportController } from '../adapter/in/web/coupang-wing-registration-export.controller';
import { CHANNELS_WING_THUMBNAIL_CAPABILITY_PORT } from '../application/port/in/capability/wing-thumbnail.port';
import { CHANNEL_DASHBOARD_PORT } from '../application/port/in/listing/channel-dashboard.port';
import { CHANNEL_LISTING_DELETION_PORT } from '../application/port/in/listing/channel-listing-deletion.port';
import { CHANNEL_OPTION_RECIPE_CANDIDATE_PORT } from '../application/port/in/listing/channel-option-recipe-candidate.port';
import { CHANNEL_PRODUCT_MATCHING_PORT } from '../application/port/in/listing/channel-product-matching.port';
import { SELLPIA_MANUAL_MATCH_PORT } from '../application/port/in/listing/sellpia-manual-match.port';
import { MALL_PUBLISHING_PORT } from '../application/port/in/registration/mall-publishing.port';
import { SABANGNET_PRODUCT_IMPORT_PORT } from '../application/port/in/collection/sabangnet-product-import.port';
import { SALES_PRODUCT_LINK_PORT } from '../application/port/in/sales-product/sales-product-link.port';
import { SALES_PRODUCT_IMAGE_PORT } from '../application/port/in/sales-product/sales-product-image.port';
import { SALES_PRODUCT_MALL_PRICE_PORT } from '../application/port/in/sales-product/sales-product-mall-price.port';
import { SALES_PRODUCT_MALL_SHEET_PORT } from '../application/port/in/sales-product/sales-product-mall-sheet.port';
import { SALES_PRODUCT_COUPANG_CATALOG_PORT } from '../application/port/in/sales-product/sales-product-coupang-catalog.port';

const IMPORTS_KEY = 'imports';
const CONTROLLERS_KEY = 'controllers';
const PROVIDERS_KEY = 'providers';

function expectBinding(
  providers: unknown[],
  token: symbol,
  adapter: unknown,
) {
  const binding = providers.find(
    (provider): provider is { provide: symbol; useExisting: unknown } =>
      typeof provider === 'object' &&
      provider !== null &&
      (provider as { provide?: unknown }).provide === token,
  );
  expect(binding).toBeDefined();
  expect(binding!.useExisting).toBe(adapter);
}

function expectFactoryBinding(
  providers: unknown[],
  token: unknown,
  dependencies: unknown[],
) {
  const binding = providers.find(
    (provider): provider is { provide: unknown; useFactory: unknown; inject: unknown[] } =>
      typeof provider === 'object' &&
      provider !== null &&
      (provider as { provide?: unknown }).provide === token,
  );
  expect(binding).toBeDefined();
  expect(binding!.useFactory).toEqual(expect.any(Function));
  expect(binding!.inject).toEqual(dependencies);
}

describe('ChannelsModule canonical owner wiring', () => {
  it('keeps Rocket PO routes outside the Channels owner', () => {
    const controllers: unknown[] = Reflect.getMetadata(CONTROLLERS_KEY, ChannelsModule) ?? [];
    expect(controllers.map((controller) => typeof controller === 'function' ? controller.name : controller))
      .not.toContain('RocketPoSourceController');
    expect(Reflect.getMetadata(IMPORTS_KEY, ChannelsModule)).toContain(AlertsModule);
  });

  it('retires legacy reconciliation wiring and schema', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, ChannelsModule) ?? [];
    const controllers: unknown[] = Reflect.getMetadata(CONTROLLERS_KEY, ChannelsModule) ?? [];
    const exports_: unknown[] = Reflect.getMetadata('exports', ChannelsModule) ?? [];
    const wiredNames = [...providers, ...controllers, ...exports_].map((value) =>
      typeof value === 'function' ? value.name : String(value));
    expect(wiredNames.join('\n')).not.toMatch(/ChannelReconciliation|RECONCILIATION/);
    expect(wiredNames.join('\n')).not.toMatch(/MarketplaceRegistration|MARKETPLACE_REGISTRATION/);
    expect(exports_).toEqual(expect.arrayContaining([
      CHANNEL_SKU_AVAILABILITY_PORT,
      CHANNEL_REGISTRATION_PORT,
      CHANNELS_WING_THUMBNAIL_CAPABILITY_PORT,
    ]));

    const channelsRoot = path.resolve(__dirname, '..');
    expect(existsSync(path.join(
      channelsRoot,
      'adapter/in/http/channel-reconciliation.controller.ts',
    ))).toBe(false);
    expect(existsSync(path.join(
      channelsRoot,
      'application/service/channel-reconciliation.service.ts',
    ))).toBe(false);

    const schema = readFileSync(
      path.resolve(__dirname, '../../../../../prisma/models/channels.prisma'),
      'utf8',
    );
    expect(schema).not.toContain('model ChannelReconciliationRun');
    expect(schema).not.toContain('model ChannelReconciliationItem');
  });

  it('imports only owner modules for direct channel capabilities', () => {
    const imports: unknown[] = Reflect.getMetadata(IMPORTS_KEY, ChannelsModule) ?? [];
    expect(imports).toContain(InventoryModule);
    expect(imports).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'AutomationModule' }),
      expect.objectContaining({ name: 'OperationsModule' }),
    ]));
  });

  it('binds every outgoing port to its local adapter', () => {
    const providers: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, ChannelsModule) ?? [];
    const catalogProviders: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, ChannelCatalogModule) ?? [];
    const salesProductProviders: unknown[] = Reflect.getMetadata(PROVIDERS_KEY, SalesProductModule) ?? [];

    expect(Reflect.getMetadata(IMPORTS_KEY, ChannelsModule)).toContain(ChannelCatalogModule);
    expect(catalogProviders).toContain(ChannelAccountPersistenceAdapter);
    expect(catalogProviders).toContain(ChannelCredentialsAdapter);
    expectFactoryBinding(catalogProviders, ChannelAccountService, [
      CHANNEL_ACCOUNT_PERSISTENCE_PORT,
      CHANNEL_CREDENTIALS_PORT,
    ]);
    expect(providers).toContain(ChannelDashboardRepositoryAdapter);
    expect(providers).toContain(ChannelListingRepositoryAdapter);
    expect(providers).toContain(ListingRegistrationPersistenceAdapter);
    expectFactoryBinding(providers, ChannelRegistrationService, [
      LISTING_REGISTRATION_PERSISTENCE_PORT,
      ChannelRecipeSuggestionService,
    ]);
    expectFactoryBinding(providers, CHANNEL_DOCUMENT_EXPORT_PORT, [CHANNEL_DOCUMENTS_PORT]);
    expectFactoryBinding(providers, ChannelCatalogImportService, [
      CHANNEL_CATALOG_IMPORT_REPOSITORY_PORT,
      CHANNEL_DOCUMENTS_PORT,
    ]);
    expectFactoryBinding(providers, ChannelCatalogCollectionService, [
      CHANNEL_CATALOG_COLLECTION_REPOSITORY_PORT,
      CHANNEL_CATALOG_PUBLICATION_PORT,
      CHANNEL_INTEGRITY_PORT,
    ]);
    expect(providers).toContain(ChannelCatalogImportRepositoryAdapter);
    expectFactoryBinding(providers, ChannelProductMatchingService, [
      CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT,
      CATALOG_DISPLAY_MEDIA_PORT,
      PRODUCT_AVAILABILITY_PORT,
      CHANNEL_ACTIVITY_PORT,
    ]);
    expectFactoryBinding(providers, ChannelRecipeSuggestionService, [
      CHANNEL_RECIPE_SUGGESTION_CONTEXT_REPOSITORY_PORT,
      SELLPIA_RECIPE_EVIDENCE_PORT,
      SELLPIA_MANUAL_MATCH_REPOSITORY_PORT,
    ]);
    expectFactoryBinding(providers, SellpiaManualMatchService, [
      SELLPIA_RECIPE_EVIDENCE_PORT,
      SELLPIA_MANUAL_MATCH_REPOSITORY_PORT,
    ]);
    expectFactoryBinding(providers, ChannelSkuAvailabilityService, [
      CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT,
      CHANNEL_PRODUCT_AVAILABILITY_PORT,
    ]);
    expect(providers).toContain(ChannelProductMatchingRepositoryAdapter);
    expect(providers).toContain(ChannelRecipeSuggestionContextRepositoryAdapter);
    expect(providers).toContain(SellpiaManualMatchRepositoryAdapter);
    expect(providers).toContain(SellpiaRecipeEvidenceAdapter);
    expect(providers).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'ChannelsOperationAlertAdapter' }),
      expect.objectContaining({ name: 'CoupangRocketPurchaseOrderOperationHandler' }),
    ]));

    expectBinding(catalogProviders, CHANNEL_ACCOUNT_PERSISTENCE_PORT, ChannelAccountPersistenceAdapter);
    expectBinding(catalogProviders, CHANNEL_CREDENTIALS_PORT, ChannelCredentialsAdapter);
    expectBinding(catalogProviders, CHANNEL_ACCOUNT_PORT, ChannelAccountService);
    expectBinding(providers, CHANNEL_INTEGRITY_PORT, ChannelIntegrityAdapter);
    expectBinding(providers, CHANNEL_ACTIVITY_PORT, ChannelActivityAdapter);
    expectBinding(providers, CHANNEL_DOCUMENTS_PORT, ChannelsDocumentsAdapter);
    expectBinding(providers, CHANNEL_PRODUCT_AVAILABILITY_PORT, ProductAvailabilityAdapter);
    expectBinding(providers, CHANNEL_DASHBOARD_PORT, ChannelDashboardService);
    expectBinding(providers, CHANNEL_LISTING_DELETION_PORT, ChannelListingDeletionService);
    expectBinding(providers, CHANNEL_OPTION_RECIPE_CANDIDATE_PORT, ChannelOptionRecipeCandidateService);
    expectBinding(providers, CHANNEL_PRODUCT_MATCHING_PORT, ChannelProductMatchingService);
    expectBinding(providers, SELLPIA_MANUAL_MATCH_PORT, SellpiaManualMatchService);
    expectBinding(providers, MALL_PUBLISHING_PORT, MallPublishingService);
    expectBinding(salesProductProviders, SABANGNET_PRODUCT_IMPORT_PORT, SabangnetProductImportService);
    expectBinding(salesProductProviders, SALES_PRODUCT_LINK_PORT, SalesProductLinkService);
    expectBinding(salesProductProviders, SALES_PRODUCT_IMAGE_PORT, SalesProductImageService);
    expectBinding(salesProductProviders, SALES_PRODUCT_MALL_PRICE_PORT, SalesProductMallPriceService);
    expectBinding(salesProductProviders, SALES_PRODUCT_MALL_SHEET_PORT, SalesProductMallSheetService);
    expectBinding(salesProductProviders, SALES_PRODUCT_COUPANG_CATALOG_PORT, SalesProductCoupangCatalogService);
    expectBinding(providers, CHANNEL_DASHBOARD_REPOSITORY_PORT, ChannelDashboardRepositoryAdapter);
    expectBinding(providers, CHANNEL_LISTING_REPOSITORY_PORT, ChannelListingRepositoryAdapter);
    expectBinding(
      providers,
      LISTING_REGISTRATION_PERSISTENCE_PORT,
      ListingRegistrationPersistenceAdapter,
    );
    expectBinding(
      providers,
      CHANNEL_REGISTRATION_PORT,
      ChannelRegistrationService,
    );
    expectBinding(
      providers,
      CHANNEL_CATALOG_IMPORT_REPOSITORY_PORT,
      ChannelCatalogImportRepositoryAdapter,
    );
    expectBinding(
      providers,
      CHANNEL_CATALOG_IMPORT_PORT,
      ChannelCatalogImportService,
    );
    expectBinding(
      providers,
      CHANNEL_CATALOG_COLLECTION_PORT,
      ChannelCatalogCollectionService,
    );
    expectBinding(
      providers,
      CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT,
      ChannelProductMatchingRepositoryAdapter,
    );
    expectBinding(
      providers,
      CHANNEL_RECIPE_SUGGESTION_CONTEXT_REPOSITORY_PORT,
      ChannelRecipeSuggestionContextRepositoryAdapter,
    );
    expectBinding(
      providers,
      SELLPIA_MANUAL_MATCH_REPOSITORY_PORT,
      SellpiaManualMatchRepositoryAdapter,
    );
    expectBinding(providers, SELLPIA_RECIPE_EVIDENCE_PORT, SellpiaRecipeEvidenceAdapter);
    expectBinding(
      providers,
      CHANNEL_SKU_AVAILABILITY_PORT,
      ChannelSkuAvailabilityService,
    );
  });

  it('registers the account-scoped Wing catalog import controller', () => {
    const controllers: unknown[] =
      Reflect.getMetadata(CONTROLLERS_KEY, ChannelsModule) ?? [];

    expect(controllers).toContain(ChannelCatalogImportController);
    expect(controllers).toContain(ChannelProductMatchingController);
    expect(controllers).toContain(ChannelSkuAvailabilityController);
    expect(controllers).toContain(CoupangWingInventoryExportController);
    expect(controllers).toContain(CoupangWingRegistrationExportController);
  });

  it('does not export the mapping repository implementation', () => {
    const exports_: unknown[] = Reflect.getMetadata('exports', ChannelsModule) ?? [];
    expect(exports_).not.toContain(ChannelProductMatchingRepositoryAdapter);
    expect(exports_).not.toContain(CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT);
    expect(exports_).not.toContain(ChannelSkuAvailabilityService);
  });

  it('does not retain generic Operation adapters or the OperationAlert port', () => {
    const channelsRoot = path.resolve(__dirname, '..');
    expect(existsSync(path.join(
      channelsRoot,
      'adapter/in/operation/coupang-rocket-purchase-order.operation-handler.ts',
    ))).toBe(false);
    expect(existsSync(path.join(
      channelsRoot,
      'adapter/out/automation/operation-alert.adapter.ts',
    ))).toBe(false);
    expect(existsSync(path.join(
      channelsRoot,
      'application/port/out/cross-domain/operation-alert.port.ts',
    ))).toBe(false);
  });
});
