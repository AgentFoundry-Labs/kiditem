import { MALL_PUBLISHING_PORT } from "./application/port/in/registration/mall-publishing.port";
import { CHANNEL_LISTING_DELETION_PORT } from "./application/port/in/listing/channel-listing-deletion.port";
import { SELLPIA_MANUAL_MATCH_PORT } from "./application/port/in/listing/sellpia-manual-match.port";
import { CHANNEL_PRODUCT_MATCHING_PORT } from "./application/port/in/listing/channel-product-matching.port";
import { CHANNEL_OPTION_RECIPE_CANDIDATE_PORT } from "./application/port/in/listing/channel-option-recipe-candidate.port";
import { CHANNEL_DASHBOARD_PORT } from "./application/port/in/listing/channel-dashboard.port";
import { CHANNEL_DOCUMENT_EXPORT_PORT } from './application/port/in/registration/channel-document-export.port';
import { ChannelDocumentExportService } from './application/service/registration/channel-document-export.service';
import type { ChannelDocumentsPort } from './application/port/out/documents/channel-documents.port';
import { ChannelIntegrityAdapter } from './adapter/out/integrity/channel-integrity.adapter';
import { CHANNEL_INTEGRITY_PORT } from './application/port/out/integrity/channel-integrity.port';
import { ChannelActivityAdapter } from './adapter/out/alerts/channel-activity.adapter';
import { CHANNEL_ACTIVITY_PORT } from './application/port/out/alerts/channel-activity.port';
import { CATALOG_DISPLAY_MEDIA_PORT } from '../content/application/port/in/workspace/catalog-display-media.port';
import { PRODUCT_AVAILABILITY_PORT } from '../products/application/port/in/product-availability.port';
import { SourcingRegistrationSourceModule } from '../sourcing/sourcing-registration-source.module';
import { ChannelsDocumentsAdapter } from './adapter/out/documents/channel-documents.adapter';
import { CHANNEL_DOCUMENTS_PORT } from './application/port/out/documents/channel-documents.port';
import { ListingContentAdapter } from './adapter/out/content/listing-content.adapter';
import { CHANNEL_LISTING_CONTENT_PORT } from './application/port/out/content/listing-content.port';
import { AiListingContentQueryModule } from '../content/ai-listing-content-query.module';
import { ChannelCatalogModule } from './channel-catalog.module';
import { ProductAvailabilityAdapter } from './adapter/out/products/product-availability.adapter';
import { CHANNEL_PRODUCT_AVAILABILITY_PORT, type ChannelProductAvailabilityPort } from './application/port/out/products/product-availability.port';
import { ChannelsProductMappingGenerationAdapter } from './adapter/out/products/product-mapping-generation.adapter';
import { CHANNELS_PRODUCT_MAPPING_GENERATION_PORT } from './application/port/out/cross-domain/product-mapping-generation.port';
import { SalesProductModule } from './sales-product.module';
import { Module } from '@nestjs/common';
import { AiModule } from '../content/ai.module';
import { AlertsModule } from '../alerts/alerts.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductCollectionRuntimeModule } from '../products/product-collection-runtime.module';
import { ChannelSyncController } from './adapter/in/web/channel-sync.controller';
import { ChannelDashboardController } from './adapter/in/web/channel-dashboard.controller';
import { ChannelAccountController } from './adapter/in/web/account/channel-account.controller';
import { ChannelAccountListController } from './adapter/in/web/account/channel-account-list.controller';
import { RocketAccountController } from './adapter/in/web/account/rocket-account.controller';
import { SabangnetMallListingsController } from './adapter/in/web/sabangnet-mall-listings.controller';
import { MallAdminListingsController } from './adapter/in/web/mall-admin-listings.controller';
import { ChannelListingController } from './adapter/in/web/listing/channel-listing.controller';
import { ChannelCatalogImportController } from './adapter/in/web/channel-catalog-import.controller';
import { RocketSellpiaMatchingCsvImportController } from './adapter/in/web/rocket-sellpia-matching-csv-import.controller';
import { ChannelCatalogCollectionController } from './adapter/in/web/channel-catalog-collection.controller';
import { ChannelCatalogSourceController } from './adapter/in/web/channel-catalog-source.controller';
import { ChannelProductMatchingController } from './adapter/in/web/channel-product-matching.controller';
import { ChannelOptionRecipeController } from './adapter/in/web/channel-option-recipe.controller';
import { ChannelSkuAvailabilityController } from './adapter/in/web/channel-sku-availability.controller';
import { MallPublishingController } from './adapter/in/web/mall-publishing.controller';
import { CoupangWingInventoryExportController } from './adapter/in/web/coupang-wing-inventory-export.controller';
import { CoupangWingRegistrationExportController } from './adapter/in/web/coupang-wing-registration-export.controller';
import { OrderCollectionMallAccountController } from './adapter/in/web/account/order-collection-mall-account.controller';
import { ChannelDashboardRepositoryAdapter } from './adapter/out/repository/channel-dashboard.repository.adapter';
import { ChannelListingRepositoryAdapter } from './adapter/out/repository/channel-listing.repository.adapter';
import { ListingRegistrationPersistenceAdapter } from './adapter/out/persistence/listing-registration.persistence.adapter';
import { LISTING_REGISTRATION_PERSISTENCE_PORT, type ListingRegistrationPersistencePort } from './application/port/out/persistence/listing-registration.persistence.port';
import { ChannelCatalogImportRepositoryAdapter } from './adapter/out/repository/channel-catalog-import.repository.adapter';
import { RocketSellpiaMatchingCsvImportRepositoryAdapter } from './adapter/out/repository/rocket-sellpia-matching-csv-import.repository.adapter';
import { ChannelCatalogCollectionRepositoryAdapter } from './adapter/out/repository/channel-catalog-collection.repository.adapter';
import { ChannelCatalogPublicationRepositoryAdapter } from './adapter/out/repository/channel-catalog-publication.repository.adapter';
import { ChannelProductMatchingRepositoryAdapter } from './adapter/out/repository/channel-product-matching.repository.adapter';
import { ChannelRecipeSuggestionContextRepositoryAdapter } from './adapter/out/repository/channel-recipe-suggestion-context.repository.adapter';
import { SellpiaManualMatchRepositoryAdapter } from './adapter/out/repository/sellpia-manual-match.repository.adapter';
import { SellpiaRecipeEvidenceAdapter } from './adapter/out/inventory/sellpia-recipe-evidence.adapter';
import { ChannelDashboardService } from './application/service/listing/channel-dashboard.service';
import { ChannelListingDeletionService } from './application/service/listing/channel-listing-deletion.service';
import { ChannelRegistrationService } from './application/service/registration/channel-registration.service';
import { ChannelCatalogImportService } from './application/service/collection/channel-catalog-import.service';
import { RocketSellpiaMatchingCsvImportService } from './application/service/collection/rocket-sellpia-matching-csv-import.service';
import { ChannelCatalogCollectionService } from './application/service/collection/channel-catalog-collection.service';
import { ChannelProductMatchingService } from './application/service/listing/channel-product-matching.service';
import { ChannelRecipeSuggestionService } from './application/service/listing/channel-recipe-suggestion.service';
import { SellpiaManualMatchService } from './application/service/listing/sellpia-manual-match.service';
import { ChannelSkuAvailabilityService } from './application/service/listing/channel-sku-availability.service';
import { ChannelOptionRecipeCandidateService } from './application/service/listing/channel-option-recipe-candidate.service';
import { MallPublishingService } from './application/service/registration/mall-publishing.service';
import { SabangnetMallListingsService } from './application/service/collection/sabangnet-mall-listings.service';
import { SabangnetMallListingsRepositoryAdapter } from './adapter/out/repository/sabangnet-mall-listings.repository.adapter';
import { SABANGNET_MALL_LISTINGS_PORT } from './application/port/in/sabangnet-mall-listings.port';
import { SABANGNET_MALL_LISTINGS_REPOSITORY_PORT } from './application/port/out/repository/sabangnet-mall-listings.repository.port';
import { MallAdminListingsService } from './application/service/collection/mall-admin-listings.service';
import { MallAdminListingsRepositoryAdapter } from './adapter/out/repository/mall-admin-listings.repository.adapter';
import { MALL_ADMIN_LISTINGS_PORT } from './application/port/in/mall-admin-listings.port';
import { MALL_ADMIN_LISTINGS_REPOSITORY_PORT } from './application/port/out/repository/mall-admin-listings.repository.port';
import { CHANNEL_REGISTRATION_PORT } from './application/port/in/registration/channel-registration.port';
import { CHANNEL_CATALOG_IMPORT_PORT } from './application/port/in/channel-catalog-import.port';
import { ROCKET_SELLPIA_MATCHING_CSV_IMPORT_PORT } from './application/port/in/rocket-sellpia-matching-csv-import.port';
import { CHANNEL_DASHBOARD_REPOSITORY_PORT } from './application/port/out/repository/channel-dashboard.repository.port';
import {
  CHANNEL_LISTING_REPOSITORY_PORT,
} from './application/port/out/repository/channel-listing.repository.port';
import { CHANNEL_CATALOG_IMPORT_REPOSITORY_PORT } from './application/port/out/repository/channel-catalog-import.repository.port';
import { ROCKET_SELLPIA_MATCHING_CSV_IMPORT_REPOSITORY_PORT } from './application/port/out/repository/rocket-sellpia-matching-csv-import.repository.port';
import { CHANNEL_CATALOG_COLLECTION_REPOSITORY_PORT } from './application/port/out/repository/channel-catalog-collection.repository.port';
import { CHANNEL_CATALOG_PUBLICATION_PORT } from './application/port/out/repository/channel-catalog-publication.port';
import { CHANNEL_CATALOG_COLLECTION_PORT } from './application/port/in/channel-catalog-collection.port';
import { CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT, type ChannelProductMatchingRepositoryPort } from './application/port/out/repository/channel-product-matching.repository.port';
import { CHANNEL_SKU_AVAILABILITY_PORT } from './application/port/in/channel-sku-availability.port';
import { MallPublishingRepositoryAdapter } from './adapter/out/repository/mall-publishing.repository.adapter';
import { MALL_PUBLISHING_REPOSITORY_PORT } from './application/port/out/repository/mall-publishing.repository.port';
import { SELLPIA_RECIPE_EVIDENCE_PORT } from './application/port/out/cross-domain/sellpia-recipe-evidence.port';
import { CHANNEL_RECIPE_SUGGESTION_CONTEXT_REPOSITORY_PORT } from './application/port/out/repository/channel-recipe-suggestion-context.repository.port';
import { SELLPIA_MANUAL_MATCH_REPOSITORY_PORT } from './application/port/out/repository/sellpia-manual-match.repository.port';
import { ChannelsWingThumbnailCapabilityAdapter } from './adapter/in/agent/channels-wing-thumbnail-capability.adapter';
import { CHANNELS_WING_THUMBNAIL_CAPABILITY_PORT } from './application/port/in/capability/wing-thumbnail.port';

@Module({
  imports: [SourcingRegistrationSourceModule, AiListingContentQueryModule, ChannelCatalogModule, SalesProductModule,
    AiModule,
    InventoryModule,
    ProductCollectionRuntimeModule,
    AlertsModule,
  ],
  controllers: [
    OrderCollectionMallAccountController,
    ChannelSyncController,
    ChannelDashboardController,
    ChannelAccountController,
    ChannelAccountListController,
    RocketAccountController,
    SabangnetMallListingsController,
    MallAdminListingsController,
    ChannelListingController,
    ChannelCatalogImportController,
    RocketSellpiaMatchingCsvImportController,
    ChannelCatalogCollectionController,
    ChannelCatalogSourceController,
    ChannelProductMatchingController,
    ChannelOptionRecipeController,
    ChannelSkuAvailabilityController,
    MallPublishingController,
    CoupangWingInventoryExportController,
    CoupangWingRegistrationExportController,
  ],
  providers: [
    { provide: MALL_PUBLISHING_PORT, useExisting: MallPublishingService },
    { provide: CHANNEL_LISTING_DELETION_PORT, useExisting: ChannelListingDeletionService },
    { provide: SELLPIA_MANUAL_MATCH_PORT, useExisting: SellpiaManualMatchService },
    { provide: CHANNEL_PRODUCT_MATCHING_PORT, useExisting: ChannelProductMatchingService },
    { provide: CHANNEL_OPTION_RECIPE_CANDIDATE_PORT, useExisting: ChannelOptionRecipeCandidateService },
    { provide: CHANNEL_DASHBOARD_PORT, useExisting: ChannelDashboardService },
    { provide: CHANNEL_DOCUMENT_EXPORT_PORT, useFactory: (documents: ChannelDocumentsPort) => new ChannelDocumentExportService(documents), inject: [CHANNEL_DOCUMENTS_PORT] },
    ChannelIntegrityAdapter,
    { provide: CHANNEL_INTEGRITY_PORT, useExisting: ChannelIntegrityAdapter },
    ChannelActivityAdapter,
    { provide: CHANNEL_ACTIVITY_PORT, useExisting: ChannelActivityAdapter },
    ChannelsDocumentsAdapter,
    { provide: CHANNEL_DOCUMENTS_PORT, useExisting: ChannelsDocumentsAdapter },
    ListingContentAdapter,
    { provide: CHANNEL_LISTING_CONTENT_PORT, useExisting: ListingContentAdapter },
    { provide: ChannelDashboardService, useFactory: (...dependencies: ConstructorParameters<typeof ChannelDashboardService>) => new ChannelDashboardService(...dependencies), inject: [CHANNEL_DASHBOARD_REPOSITORY_PORT] },
    { provide: ChannelListingDeletionService, useFactory: (...dependencies: ConstructorParameters<typeof ChannelListingDeletionService>) => new ChannelListingDeletionService(...dependencies), inject: [CHANNEL_LISTING_REPOSITORY_PORT] },
    {
      provide: ChannelRegistrationService,
      useFactory: (persistence: ListingRegistrationPersistencePort, suggestions: ChannelRecipeSuggestionService) => new ChannelRegistrationService(persistence, suggestions),
      inject: [LISTING_REGISTRATION_PERSISTENCE_PORT, ChannelRecipeSuggestionService],
    },
    { provide: ChannelCatalogImportService, useFactory: (...dependencies: ConstructorParameters<typeof ChannelCatalogImportService>) => new ChannelCatalogImportService(...dependencies), inject: [CHANNEL_CATALOG_IMPORT_REPOSITORY_PORT, CHANNEL_DOCUMENTS_PORT] },
    { provide: RocketSellpiaMatchingCsvImportService, useFactory: (...dependencies: ConstructorParameters<typeof RocketSellpiaMatchingCsvImportService>) => new RocketSellpiaMatchingCsvImportService(...dependencies), inject: [ROCKET_SELLPIA_MATCHING_CSV_IMPORT_REPOSITORY_PORT, CHANNEL_DOCUMENTS_PORT] },
    { provide: ChannelCatalogCollectionService, useFactory: (...dependencies: ConstructorParameters<typeof ChannelCatalogCollectionService>) => new ChannelCatalogCollectionService(...dependencies), inject: [CHANNEL_CATALOG_COLLECTION_REPOSITORY_PORT, CHANNEL_CATALOG_PUBLICATION_PORT, CHANNEL_INTEGRITY_PORT] },
    { provide: ChannelProductMatchingService, useFactory: (...dependencies: ConstructorParameters<typeof ChannelProductMatchingService>) => new ChannelProductMatchingService(...dependencies), inject: [CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT, CATALOG_DISPLAY_MEDIA_PORT, PRODUCT_AVAILABILITY_PORT, CHANNEL_ACTIVITY_PORT] },
    { provide: ChannelRecipeSuggestionService, useFactory: (...dependencies: ConstructorParameters<typeof ChannelRecipeSuggestionService>) => new ChannelRecipeSuggestionService(...dependencies), inject: [CHANNEL_RECIPE_SUGGESTION_CONTEXT_REPOSITORY_PORT, SELLPIA_RECIPE_EVIDENCE_PORT, SELLPIA_MANUAL_MATCH_REPOSITORY_PORT] },
    { provide: ChannelOptionRecipeCandidateService, useFactory: (...dependencies: ConstructorParameters<typeof ChannelOptionRecipeCandidateService>) => new ChannelOptionRecipeCandidateService(...dependencies), inject: [PRODUCT_AVAILABILITY_PORT] },
    { provide: SellpiaManualMatchService, useFactory: (...dependencies: ConstructorParameters<typeof SellpiaManualMatchService>) => new SellpiaManualMatchService(...dependencies), inject: [SELLPIA_RECIPE_EVIDENCE_PORT, SELLPIA_MANUAL_MATCH_REPOSITORY_PORT] },
    {
      provide: ChannelSkuAvailabilityService,
      useFactory: (persistence: ChannelProductMatchingRepositoryPort, products: ChannelProductAvailabilityPort) => new ChannelSkuAvailabilityService(persistence, products),
      inject: [CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT, CHANNEL_PRODUCT_AVAILABILITY_PORT],
    },
    ProductAvailabilityAdapter,
    { provide: CHANNEL_PRODUCT_AVAILABILITY_PORT, useExisting: ProductAvailabilityAdapter },
    ChannelsProductMappingGenerationAdapter,
    { provide: CHANNELS_PRODUCT_MAPPING_GENERATION_PORT, useExisting: ChannelsProductMappingGenerationAdapter },
    ChannelsWingThumbnailCapabilityAdapter,
    ChannelDashboardRepositoryAdapter,
    ChannelListingRepositoryAdapter,
    ListingRegistrationPersistenceAdapter,
    ChannelCatalogImportRepositoryAdapter,
    RocketSellpiaMatchingCsvImportRepositoryAdapter,
    ChannelCatalogCollectionRepositoryAdapter,
    ChannelCatalogPublicationRepositoryAdapter,
    ChannelProductMatchingRepositoryAdapter,
    ChannelRecipeSuggestionContextRepositoryAdapter,
    SellpiaManualMatchRepositoryAdapter,
    SellpiaRecipeEvidenceAdapter,
    { provide: CHANNEL_DASHBOARD_REPOSITORY_PORT, useExisting: ChannelDashboardRepositoryAdapter },
    { provide: CHANNEL_LISTING_REPOSITORY_PORT, useExisting: ChannelListingRepositoryAdapter },
    {
      provide: LISTING_REGISTRATION_PERSISTENCE_PORT,
      useExisting: ListingRegistrationPersistenceAdapter,
    },
    {
      provide: CHANNEL_REGISTRATION_PORT,
      useExisting: ChannelRegistrationService,
    },
    { provide: CHANNELS_WING_THUMBNAIL_CAPABILITY_PORT, useExisting: ChannelsWingThumbnailCapabilityAdapter },
    {
      provide: CHANNEL_CATALOG_IMPORT_REPOSITORY_PORT,
      useExisting: ChannelCatalogImportRepositoryAdapter,
    },
    {
      provide: CHANNEL_CATALOG_IMPORT_PORT,
      useExisting: ChannelCatalogImportService,
    },
    {
      provide: ROCKET_SELLPIA_MATCHING_CSV_IMPORT_REPOSITORY_PORT,
      useExisting: RocketSellpiaMatchingCsvImportRepositoryAdapter,
    },
    {
      provide: ROCKET_SELLPIA_MATCHING_CSV_IMPORT_PORT,
      useExisting: RocketSellpiaMatchingCsvImportService,
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
      provide: SELLPIA_MANUAL_MATCH_REPOSITORY_PORT,
      useExisting: SellpiaManualMatchRepositoryAdapter,
    },
    { provide: SELLPIA_RECIPE_EVIDENCE_PORT, useExisting: SellpiaRecipeEvidenceAdapter },
    {
      provide: CHANNEL_SKU_AVAILABILITY_PORT,
      useExisting: ChannelSkuAvailabilityService,
    },
    { provide: SabangnetMallListingsService, useFactory: (...dependencies: ConstructorParameters<typeof SabangnetMallListingsService>) => new SabangnetMallListingsService(...dependencies), inject: [SABANGNET_MALL_LISTINGS_REPOSITORY_PORT] },
    SabangnetMallListingsRepositoryAdapter,
    {
      provide: SABANGNET_MALL_LISTINGS_REPOSITORY_PORT,
      useExisting: SabangnetMallListingsRepositoryAdapter,
    },
    { provide: SABANGNET_MALL_LISTINGS_PORT, useExisting: SabangnetMallListingsService },
    { provide: MallAdminListingsService, useFactory: (...dependencies: ConstructorParameters<typeof MallAdminListingsService>) => new MallAdminListingsService(...dependencies), inject: [MALL_ADMIN_LISTINGS_REPOSITORY_PORT] },
    MallAdminListingsRepositoryAdapter,
    {
      provide: MALL_ADMIN_LISTINGS_REPOSITORY_PORT,
      useExisting: MallAdminListingsRepositoryAdapter,
    },
    { provide: MALL_ADMIN_LISTINGS_PORT, useExisting: MallAdminListingsService },
    { provide: MallPublishingService, useFactory: (...dependencies: ConstructorParameters<typeof MallPublishingService>) => new MallPublishingService(...dependencies), inject: [MALL_PUBLISHING_REPOSITORY_PORT, CHANNEL_SKU_AVAILABILITY_PORT] },
    MallPublishingRepositoryAdapter,
    {
      provide: MALL_PUBLISHING_REPOSITORY_PORT,
      useExisting: MallPublishingRepositoryAdapter,
    },
  ],
  exports: [
    ChannelCatalogModule,
    CHANNEL_SKU_AVAILABILITY_PORT,
    CHANNEL_REGISTRATION_PORT,
      CHANNELS_WING_THUMBNAIL_CAPABILITY_PORT,
  ],
})
export class ChannelsModule {}
