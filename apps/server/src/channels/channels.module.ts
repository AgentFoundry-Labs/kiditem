import { MALL_PUBLISHING_PORT } from "./application/port/in/registration/mall-publishing.port";
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
import { ChannelProductMatchingController } from './adapter/in/web/channel-product-matching.controller';
import { ChannelOptionRecipeController } from './adapter/in/web/channel-option-recipe.controller';
import { ChannelSkuAvailabilityController } from './adapter/in/web/channel-sku-availability.controller';
import { MallPublishingController } from './adapter/in/web/mall-publishing.controller';
import { CoupangWingInventoryExportController } from './adapter/in/web/coupang-wing-inventory-export.controller';
import { CoupangWingRegistrationExportController } from './adapter/in/web/coupang-wing-registration-export.controller';
import { OrderCollectionMallAccountController } from './adapter/in/web/account/order-collection-mall-account.controller';
import { ChannelDashboardRepositoryAdapter } from './adapter/out/repository/channel-dashboard.repository.adapter';
import { ListingRegistrationPersistenceAdapter } from './adapter/out/persistence/listing-registration.persistence.adapter';
import { LISTING_REGISTRATION_PERSISTENCE_PORT, type ListingRegistrationPersistencePort } from './application/port/out/persistence/listing-registration.persistence.port';
import { RocketSellpiaMatchingCsvImportRepositoryAdapter } from './adapter/out/repository/rocket-sellpia-matching-csv-import.repository.adapter';
import { ChannelCatalogPublicationRepositoryAdapter } from './adapter/out/repository/channel-catalog-publication.repository.adapter';
import { WING_CATALOG_OPERATION_OWNERS } from './adapter/in/operation/wing-catalog-operation-owners';
import { RocketMatchingCsvOperationOwner } from './adapter/in/operation/rocket-matching-csv-operation-owner';
import { SabangnetMallListingsOperationOwner } from './adapter/in/operation/sabangnet-mall-listings-operation-owner';
import { SellpiaManualMatchOperationOwner } from './adapter/in/operation/sellpia-manual-match-operation-owner';
import { WingCatalogOperationService } from './application/service/collection/wing-catalog-operation.service';
import { WING_CATALOG_OPERATION_PORT } from './application/port/in/wing-catalog-operation.port';
import { OperationModule } from '../common/operation/operation.module';
import { OPERATION_PORT } from '../common/operation/application/port/in/operation.port';
import { ChannelProductMatchingRepositoryAdapter } from './adapter/out/repository/channel-product-matching.repository.adapter';
import { ChannelRecipeSuggestionContextRepositoryAdapter } from './adapter/out/repository/channel-recipe-suggestion-context.repository.adapter';
import { SellpiaManualMatchRepositoryAdapter } from './adapter/out/repository/sellpia-manual-match.repository.adapter';
import { SellpiaRecipeEvidenceAdapter } from './adapter/out/inventory/sellpia-recipe-evidence.adapter';
import { ChannelDashboardService } from './application/service/listing/channel-dashboard.service';
import { ChannelRegistrationService } from './application/service/registration/channel-registration.service';
import { RocketSellpiaMatchingCsvImportService } from './application/service/collection/rocket-sellpia-matching-csv-import.service';
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
import { ROCKET_SELLPIA_MATCHING_CSV_IMPORT_PORT } from './application/port/in/rocket-sellpia-matching-csv-import.port';
import { CHANNEL_DASHBOARD_REPOSITORY_PORT } from './application/port/out/repository/channel-dashboard.repository.port';
import { ROCKET_SELLPIA_MATCHING_CSV_IMPORT_REPOSITORY_PORT } from './application/port/out/repository/rocket-sellpia-matching-csv-import.repository.port';
import { CHANNEL_CATALOG_PUBLICATION_PORT } from './application/port/out/repository/channel-catalog-publication.port';
import { CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT, type ChannelProductMatchingRepositoryPort } from './application/port/out/repository/channel-product-matching.repository.port';
import { CHANNEL_SKU_AVAILABILITY_PORT } from './application/port/in/channel-sku-availability.port';
import { MallPublishingRepositoryAdapter } from './adapter/out/repository/mall-publishing.repository.adapter';
import { MALL_PUBLISHING_REPOSITORY_PORT } from './application/port/out/repository/mall-publishing.repository.port';
import { SELLPIA_RECIPE_EVIDENCE_PORT } from './application/port/out/cross-domain/sellpia-recipe-evidence.port';
import { CHANNEL_RECIPE_SUGGESTION_CONTEXT_REPOSITORY_PORT } from './application/port/out/repository/channel-recipe-suggestion-context.repository.port';
import { SELLPIA_MANUAL_MATCH_REPOSITORY_PORT } from './application/port/out/repository/sellpia-manual-match.repository.port';
import { ChannelsRepresentativeImageCapabilityAdapter } from './adapter/in/agent/channels-representative-image-capability.adapter';
import { CHANNELS_REPRESENTATIVE_IMAGE_CAPABILITY_PORT } from './application/port/in/capability/representative-image.port';
import { ThumbnailExecutionController } from './adapter/in/web/thumbnail-execution.controller';
import { ThumbnailExecutionPersistenceAdapter } from './adapter/out/persistence/thumbnail-execution.persistence.adapter';
import { CoupangRepresentativeImageRunnerAdapter } from './adapter/out/channel/coupang/representative-image-runner.adapter';
import { RegistrableThumbnailAdapter } from './adapter/out/content/registrable-thumbnail.adapter';
import { ThumbnailExecutionService } from './application/service/registration/thumbnail-execution.service';
import { CHANNELS_THUMBNAIL_EXECUTION_PORT } from './application/port/in/thumbnail-execution.port';
import { THUMBNAIL_EXECUTION_PERSISTENCE_PORT } from './application/port/out/persistence/thumbnail-execution.persistence.port';
import { CHANNEL_ADAPTER_REGISTRY_PORT } from './application/port/out/channel/channel-adapter.port';
import { ChannelAdapterRegistryAdapter } from './adapter/out/channel/channel-adapter-registry.adapter';
import { CoupangChannelAdapter } from './adapter/out/channel/coupang/coupang-channel.adapter';
import { CHANNEL_REGISTRABLE_THUMBNAIL_PORT } from './application/port/out/content/registrable-thumbnail.port';
import { ChannelsRegistrationStateModule } from './channels-registration-state.module';
import { REGISTRATION_STATE_PORT } from './application/port/in/registration-state.port';

@Module({
  imports: [AiListingContentQueryModule, ChannelCatalogModule, SalesProductModule, ChannelsRegistrationStateModule,
    AiModule,
    InventoryModule,
    ProductCollectionRuntimeModule,
    AlertsModule,
    OperationModule,
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
    ChannelProductMatchingController,
    ChannelOptionRecipeController,
    ChannelSkuAvailabilityController,
    MallPublishingController,
    CoupangWingInventoryExportController,
    CoupangWingRegistrationExportController,
    ThumbnailExecutionController,
  ],
  providers: [
    { provide: MALL_PUBLISHING_PORT, useExisting: MallPublishingService },
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
    {
      provide: ChannelRegistrationService,
      useFactory: (persistence: ListingRegistrationPersistencePort, suggestions: ChannelRecipeSuggestionService) => new ChannelRegistrationService(persistence, suggestions),
      inject: [LISTING_REGISTRATION_PERSISTENCE_PORT, ChannelRecipeSuggestionService],
    },
    // 로켓 매칭 CSV 실행 kind(KID-363). 업로드를 받은 서버가 producer다.
    RocketSellpiaMatchingCsvImportService,
    RocketMatchingCsvOperationOwner,
    { provide: ChannelProductMatchingService, useFactory: (...dependencies: ConstructorParameters<typeof ChannelProductMatchingService>) => new ChannelProductMatchingService(...dependencies), inject: [CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT, CATALOG_DISPLAY_MEDIA_PORT, PRODUCT_AVAILABILITY_PORT, CHANNEL_ACTIVITY_PORT] },
    { provide: ChannelRecipeSuggestionService, useFactory: (...dependencies: ConstructorParameters<typeof ChannelRecipeSuggestionService>) => new ChannelRecipeSuggestionService(...dependencies), inject: [CHANNEL_RECIPE_SUGGESTION_CONTEXT_REPOSITORY_PORT, SELLPIA_RECIPE_EVIDENCE_PORT, SELLPIA_MANUAL_MATCH_REPOSITORY_PORT] },
    { provide: ChannelOptionRecipeCandidateService, useFactory: (...dependencies: ConstructorParameters<typeof ChannelOptionRecipeCandidateService>) => new ChannelOptionRecipeCandidateService(...dependencies), inject: [PRODUCT_AVAILABILITY_PORT] },
    // 셀피아 수동상품매칭 실행 kind(KID-363). owner는 부팅 때 실행 계약에 등록된다.
    SellpiaManualMatchService,
    SellpiaManualMatchOperationOwner,
    {
      provide: ChannelSkuAvailabilityService,
      useFactory: (persistence: ChannelProductMatchingRepositoryPort, products: ChannelProductAvailabilityPort) => new ChannelSkuAvailabilityService(persistence, products),
      inject: [CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT, CHANNEL_PRODUCT_AVAILABILITY_PORT],
    },
    ProductAvailabilityAdapter,
    { provide: CHANNEL_PRODUCT_AVAILABILITY_PORT, useExisting: ProductAvailabilityAdapter },
    ChannelsProductMappingGenerationAdapter,
    { provide: CHANNELS_PRODUCT_MAPPING_GENERATION_PORT, useExisting: ChannelsProductMappingGenerationAdapter },
    ChannelsRepresentativeImageCapabilityAdapter,
    // 대표이미지 몰 반영 실행(thumbnail_update). Content 는 승인 사진만 준다.
    ThumbnailExecutionPersistenceAdapter,
    CoupangRepresentativeImageRunnerAdapter,
    RegistrableThumbnailAdapter,
    { provide: THUMBNAIL_EXECUTION_PERSISTENCE_PORT, useExisting: ThumbnailExecutionPersistenceAdapter },
    // 채널 어댑터(KID-321): 몰마다 다른 것 — 계정 식별자 · 확인 증거 · 준비 때 얼릴 몰 사실 · 대표이미지 runner.
    CoupangChannelAdapter,
    ChannelAdapterRegistryAdapter,
    { provide: CHANNEL_ADAPTER_REGISTRY_PORT, useExisting: ChannelAdapterRegistryAdapter },
    { provide: CHANNEL_REGISTRABLE_THUMBNAIL_PORT, useExisting: RegistrableThumbnailAdapter },
    { provide: ThumbnailExecutionService, useFactory: (...dependencies: ConstructorParameters<typeof ThumbnailExecutionService>) => new ThumbnailExecutionService(...dependencies), inject: [CHANNEL_REGISTRABLE_THUMBNAIL_PORT, THUMBNAIL_EXECUTION_PERSISTENCE_PORT, CHANNEL_ADAPTER_REGISTRY_PORT, CHANNEL_INTEGRITY_PORT] },
    { provide: CHANNELS_THUMBNAIL_EXECUTION_PORT, useExisting: ThumbnailExecutionService },
    ChannelDashboardRepositoryAdapter,
    ListingRegistrationPersistenceAdapter,
    RocketSellpiaMatchingCsvImportRepositoryAdapter,
    ChannelCatalogPublicationRepositoryAdapter,
    // Wing 카탈로그 실행 kind 셋(KID-354·351). owner는 부팅 때 실행 계약에 등록된다.
    WingCatalogOperationService,
    { provide: WING_CATALOG_OPERATION_PORT, useExisting: WingCatalogOperationService },
    ...WING_CATALOG_OPERATION_OWNERS,
    ChannelProductMatchingRepositoryAdapter,
    ChannelRecipeSuggestionContextRepositoryAdapter,
    SellpiaManualMatchRepositoryAdapter,
    SellpiaRecipeEvidenceAdapter,
    { provide: CHANNEL_DASHBOARD_REPOSITORY_PORT, useExisting: ChannelDashboardRepositoryAdapter },
    {
      provide: LISTING_REGISTRATION_PERSISTENCE_PORT,
      useExisting: ListingRegistrationPersistenceAdapter,
    },
    {
      provide: CHANNEL_REGISTRATION_PORT,
      useExisting: ChannelRegistrationService,
    },
    { provide: CHANNELS_REPRESENTATIVE_IMAGE_CAPABILITY_PORT, useExisting: ChannelsRepresentativeImageCapabilityAdapter },
    {
      provide: ROCKET_SELLPIA_MATCHING_CSV_IMPORT_REPOSITORY_PORT,
      useExisting: RocketSellpiaMatchingCsvImportRepositoryAdapter,
    },
    {
      provide: ROCKET_SELLPIA_MATCHING_CSV_IMPORT_PORT,
      useExisting: RocketSellpiaMatchingCsvImportService,
    },
    {
      provide: CHANNEL_CATALOG_PUBLICATION_PORT,
      useExisting: ChannelCatalogPublicationRepositoryAdapter,
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
    // 사방넷 몰 목록 실행 kind(KID-363). owner는 부팅 때 실행 계약에 등록된다.
    SabangnetMallListingsService,
    SabangnetMallListingsOperationOwner,
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
    { provide: MallPublishingService, useFactory: (...dependencies: ConstructorParameters<typeof MallPublishingService>) => new MallPublishingService(...dependencies), inject: [MALL_PUBLISHING_REPOSITORY_PORT, CHANNEL_SKU_AVAILABILITY_PORT, REGISTRATION_STATE_PORT] },
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
    CHANNELS_REPRESENTATIVE_IMAGE_CAPABILITY_PORT,
    CHANNEL_ADAPTER_REGISTRY_PORT,
    CHANNEL_REGISTRABLE_THUMBNAIL_PORT,
  ],
})
export class ChannelsModule {}
