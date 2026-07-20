import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { AiModule } from '../ai/ai.module';
import { ProductsModule } from '../products/products.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ChannelRegistrationCapabilityAdapter } from './adapter/in/agent/channel-registration-capability.adapter';
import { ChannelSyncController } from './adapter/in/http/channel-sync.controller';
import { ChannelDashboardController } from './adapter/in/http/channel-dashboard.controller';
import { ChannelAccountController } from './adapter/in/http/channel-account.controller';
import { ChannelAccountListController } from './adapter/in/http/channel-account-list.controller';
import { ChannelListingController } from './adapter/in/http/channel-listing.controller';
import { ChannelCatalogImportController } from './adapter/in/http/channel-catalog-import.controller';
import { ChannelCatalogCollectionController } from './adapter/in/http/channel-catalog-collection.controller';
import { ChannelProductMatchingController } from './adapter/in/http/channel-product-matching.controller';
import { ChannelSkuAvailabilityController } from './adapter/in/http/channel-sku-availability.controller';
import { CoupangProviderAdapter } from './adapter/out/coupang/coupang-provider.adapter';
import { ChannelAccountRepositoryAdapter } from './adapter/out/repository/channel-account.repository.adapter';
import { ChannelDashboardRepositoryAdapter } from './adapter/out/repository/channel-dashboard.repository.adapter';
import { ChannelListingRepositoryAdapter } from './adapter/out/repository/channel-listing.repository.adapter';
import { MarketplaceRegistrationRepositoryAdapter } from './adapter/out/repository/marketplace-registration.repository.adapter';
import { ChannelSyncRepositoryAdapter } from './adapter/out/repository/channel-sync.repository.adapter';
import { ChannelCatalogImportRepositoryAdapter } from './adapter/out/repository/channel-catalog-import.repository.adapter';
import { ChannelCatalogCollectionRepositoryAdapter } from './adapter/out/repository/channel-catalog-collection.repository.adapter';
import { ChannelCatalogPublicationRepositoryAdapter } from './adapter/out/repository/channel-catalog-publication.repository.adapter';
import { ChannelProductMatchingRepositoryAdapter } from './adapter/out/repository/channel-product-matching.repository.adapter';
import { ChannelRecipeSuggestionContextRepositoryAdapter } from './adapter/out/repository/channel-recipe-suggestion-context.repository.adapter';
import { ChannelRecipeAutomationContextRepositoryAdapter } from './adapter/out/repository/channel-recipe-automation-context.repository.adapter';
import { SellpiaRecipeEvidenceAdapter } from './adapter/out/inventory/sellpia-recipe-evidence.adapter';
import { ChannelSyncService } from './application/service/channel-sync.service';
import { ChannelDashboardService } from './application/service/channel-dashboard.service';
import { ChannelListingQueryService } from './application/service/channel-listing-query.service';
import { ChannelListingDeletionService } from './application/service/channel-listing-deletion.service';
import { ChannelsDeletionPasswordAdapter } from './adapter/out/organizations/deletion-password.adapter';
import { CHANNELS_DELETION_PASSWORD_PORT } from './application/port/out/cross-domain/deletion-password.port';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ChannelAccountQueryService } from './application/service/channel-account-query.service';
import { MarketplaceRegistrationService } from './application/service/marketplace-registration.service';
import { ChannelAccountService } from './application/service/channel-account.service';
import { ChannelCatalogImportService } from './application/service/channel-catalog-import.service';
import { ChannelCatalogCollectionService } from './application/service/channel-catalog-collection.service';
import { ChannelProductMatchingService } from './application/service/channel-product-matching.service';
import { ChannelRecipeSuggestionService } from './application/service/channel-recipe-suggestion.service';
import { ChannelRecipeAutomationService } from './application/service/channel-recipe-automation.service';
import { ChannelSkuAvailabilityService } from './application/service/channel-sku-availability.service';
import { RocketPoCatalogService } from './application/service/rocket-po-catalog.service';
import { RocketPoCatalogRepositoryAdapter } from './adapter/out/repository/rocket-po-catalog.repository.adapter';
import { ROCKET_PO_CATALOG_PORT } from './application/port/in/rocket-po-catalog.port';
import { ROCKET_PO_CATALOG_REPOSITORY_PORT } from './application/port/out/repository/rocket-po-catalog.repository.port';
import { COUPANG_PROVIDER_PORT } from './application/port/out/provider/coupang-provider.port';
import { ChannelsOperationAlertAdapter } from './adapter/out/automation/operation-alert.adapter';
import { CHANNELS_OPERATION_ALERT_PORT } from './application/port/out/cross-domain/operation-alert.port';
import { CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT } from './application/port/in/capability/marketplace-registration.port';
import { CHANNEL_CATALOG_IMPORT_PORT } from './application/port/in/channel-catalog-import.port';
import {
  CHANNEL_ACCOUNT_REPOSITORY_PORT,
  COUPANG_CREDENTIALS_PORT,
} from './application/port/out/repository/channel-account.repository.port';
import { CHANNEL_DASHBOARD_REPOSITORY_PORT } from './application/port/out/repository/channel-dashboard.repository.port';
import {
  CHANNEL_LISTING_REPOSITORY_PORT,
  MARKETPLACE_REGISTRATION_REPOSITORY_PORT,
} from './application/port/out/repository/channel-listing.repository.port';
import { CHANNEL_SYNC_REPOSITORY_PORT } from './application/port/out/repository/channel-sync.repository.port';
import { CHANNEL_CATALOG_IMPORT_REPOSITORY_PORT } from './application/port/out/repository/channel-catalog-import.repository.port';
import { CHANNEL_CATALOG_COLLECTION_REPOSITORY_PORT } from './application/port/out/repository/channel-catalog-collection.repository.port';
import { CHANNEL_CATALOG_PUBLICATION_PORT } from './application/port/out/repository/channel-catalog-publication.port';
import { CHANNEL_CATALOG_COLLECTION_PORT } from './application/port/in/channel-catalog-collection.port';
import { CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT } from './application/port/out/repository/channel-product-matching.repository.port';
import { CHANNEL_SKU_AVAILABILITY_PORT } from './application/port/in/channel-sku-availability.port';
import { SELLPIA_RECIPE_EVIDENCE_PORT } from './application/port/out/cross-domain/sellpia-recipe-evidence.port';
import { CHANNEL_RECIPE_SUGGESTION_CONTEXT_REPOSITORY_PORT } from './application/port/out/repository/channel-recipe-suggestion-context.repository.port';
import { CHANNEL_RECIPE_AUTOMATION_CONTEXT_REPOSITORY_PORT } from './application/port/out/repository/channel-recipe-automation-context.repository.port';

@Module({
  imports: [AutomationModule, AiModule, ProductsModule, InventoryModule, OrganizationsModule],
  controllers: [
    ChannelSyncController,
    ChannelDashboardController,
    ChannelAccountController,
    ChannelAccountListController,
    ChannelListingController,
    ChannelCatalogImportController,
    ChannelCatalogCollectionController,
    ChannelProductMatchingController,
    ChannelSkuAvailabilityController,
  ],
  providers: [
    ChannelSyncService,
    ChannelDashboardService,
    ChannelListingQueryService,
    ChannelListingDeletionService,
    ChannelsDeletionPasswordAdapter,
    ChannelAccountQueryService,
    MarketplaceRegistrationService,
    ChannelAccountService,
    ChannelCatalogImportService,
    ChannelCatalogCollectionService,
    ChannelProductMatchingService,
    ChannelRecipeSuggestionService,
    ChannelRecipeAutomationService,
    ChannelSkuAvailabilityService,
    RocketPoCatalogService,
    ChannelRegistrationCapabilityAdapter,
    CoupangProviderAdapter,
    ChannelsOperationAlertAdapter,
    ChannelAccountRepositoryAdapter,
    ChannelDashboardRepositoryAdapter,
    ChannelListingRepositoryAdapter,
    MarketplaceRegistrationRepositoryAdapter,
    ChannelSyncRepositoryAdapter,
    ChannelCatalogImportRepositoryAdapter,
    ChannelCatalogCollectionRepositoryAdapter,
    ChannelCatalogPublicationRepositoryAdapter,
    ChannelProductMatchingRepositoryAdapter,
    ChannelRecipeSuggestionContextRepositoryAdapter,
    ChannelRecipeAutomationContextRepositoryAdapter,
    SellpiaRecipeEvidenceAdapter,
    RocketPoCatalogRepositoryAdapter,
    { provide: COUPANG_PROVIDER_PORT, useExisting: CoupangProviderAdapter },
    { provide: CHANNELS_OPERATION_ALERT_PORT, useExisting: ChannelsOperationAlertAdapter },
    { provide: CHANNEL_ACCOUNT_REPOSITORY_PORT, useExisting: ChannelAccountRepositoryAdapter },
    { provide: COUPANG_CREDENTIALS_PORT, useExisting: ChannelAccountRepositoryAdapter },
    { provide: CHANNEL_DASHBOARD_REPOSITORY_PORT, useExisting: ChannelDashboardRepositoryAdapter },
    { provide: CHANNEL_LISTING_REPOSITORY_PORT, useExisting: ChannelListingRepositoryAdapter },
    { provide: CHANNELS_DELETION_PASSWORD_PORT, useExisting: ChannelsDeletionPasswordAdapter },
    {
      provide: MARKETPLACE_REGISTRATION_REPOSITORY_PORT,
      useExisting: MarketplaceRegistrationRepositoryAdapter,
    },
    {
      provide: CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT,
      useExisting: ChannelRegistrationCapabilityAdapter,
    },
    { provide: CHANNEL_SYNC_REPOSITORY_PORT, useExisting: ChannelSyncRepositoryAdapter },
    {
      provide: CHANNEL_CATALOG_IMPORT_REPOSITORY_PORT,
      useExisting: ChannelCatalogImportRepositoryAdapter,
    },
    {
      provide: CHANNEL_CATALOG_IMPORT_PORT,
      useExisting: ChannelCatalogImportService,
    },
    {
      provide: CHANNEL_CATALOG_COLLECTION_REPOSITORY_PORT,
      useExisting: ChannelCatalogCollectionRepositoryAdapter,
    },
    {
      provide: CHANNEL_CATALOG_PUBLICATION_PORT,
      useExisting: ChannelCatalogPublicationRepositoryAdapter,
    },
    {
      provide: CHANNEL_CATALOG_COLLECTION_PORT,
      useExisting: ChannelCatalogCollectionService,
    },
    {
      provide: CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT,
      useExisting: ChannelProductMatchingRepositoryAdapter,
    },
    {
      provide: CHANNEL_RECIPE_SUGGESTION_CONTEXT_REPOSITORY_PORT,
      useExisting: ChannelRecipeSuggestionContextRepositoryAdapter,
    },
    {
      provide: CHANNEL_RECIPE_AUTOMATION_CONTEXT_REPOSITORY_PORT,
      useExisting: ChannelRecipeAutomationContextRepositoryAdapter,
    },
    { provide: SELLPIA_RECIPE_EVIDENCE_PORT, useExisting: SellpiaRecipeEvidenceAdapter },
    {
      provide: CHANNEL_SKU_AVAILABILITY_PORT,
      useExisting: ChannelSkuAvailabilityService,
    },
    {
      provide: ROCKET_PO_CATALOG_REPOSITORY_PORT,
      useExisting: RocketPoCatalogRepositoryAdapter,
    },
    { provide: ROCKET_PO_CATALOG_PORT, useExisting: RocketPoCatalogService },
  ],
  exports: [
    COUPANG_PROVIDER_PORT,
    CHANNEL_SKU_AVAILABILITY_PORT,
    CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT,
    ROCKET_PO_CATALOG_PORT,
  ],
})
export class ChannelsModule {}
