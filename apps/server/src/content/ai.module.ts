import { Module } from '@nestjs/common';
import { ChannelCatalogModule } from '../channels/channel-catalog.module';
import { SalesProductModule } from '../channels/sales-product.module';
import { SalesProductOwnerReadAdapter } from './adapter/out/channels/sales-product-owner.adapter';
import { SALES_PRODUCT_OWNER_READ_PORT } from './application/port/out/cross-domain/sales-product-owner.port';
import { StorageService } from '../common/storage/storage.service';
import { StorageModule } from '../common/storage/storage.module';
import { AgentOsCapabilityModule } from '../agent-os/agent-os-capability.module';
import { PrismaModule } from '../prisma/prisma.module';
// adapter/in/http
import { CATALOG_MEDIA_PUBLICATION_PORT } from '../channels/application/port/out/cross-domain/catalog-media-publication.port';
import { ImageAiController } from './adapter/in/http/image-ai.controller';
import { ContentArchiveController } from './adapter/in/http/content-archive.controller';
import { ContentArchiveLinkageController } from './adapter/in/http/content-archive-linkage.controller';
import { ContentAssetController } from './adapter/in/http/content-asset.controller';
import { ContentGenerationRerunController } from './adapter/in/http/content-generation-rerun.controller';
import { DetailPageWorkspaceImageController } from './adapter/in/http/detail-page-workspace-image.controller';
import { DetailPageEditorController } from './adapter/in/http/detail-page-editor.controller';
import { DetailPageGenerationController } from './adapter/in/http/detail-page-generation.controller';
import { RenderImageController } from './adapter/in/http/render-image.controller';
import { ContentWorkspaceController } from './adapter/in/http/content-workspace.controller';
import { TextAiController } from './adapter/in/http/text-ai.controller';
import { ThumbnailAnalysisController } from './adapter/in/http/thumbnail-analysis.controller';
import { ThumbnailAnalysisEditJobsController } from './adapter/in/http/thumbnail-analysis-edit-jobs.controller';
import { ThumbnailAnalysisGenerationReviewController } from './adapter/in/http/thumbnail-analysis-generation-review.controller';
import { ThumbnailAutoController } from './adapter/in/http/thumbnail-auto.controller';
import { ThumbnailEditorController } from './adapter/in/http/thumbnail-editor.controller';
import { ThumbnailTrackingController } from './adapter/in/http/thumbnail-tracking.controller';
// adapter/in/agent
// adapter/out
import { DetailPageContentGenerationSinkAdapter } from './adapter/out/direct-output/detail-page-content-generation-sink.adapter';
import { ThumbnailGenerationSinkAdapter } from './adapter/out/direct-output/thumbnail-generation-sink.adapter';
import { AiCatalogMediaPublicationRepositoryAdapter } from './adapter/out/repository/ai-catalog-media-publication.repository.adapter';
import { CatalogDisplayMediaRepositoryAdapter } from './adapter/out/repository/catalog-display-media.repository.adapter';
import { AiDirectJobRepositoryAdapter } from './adapter/out/repository/ai-direct-job.repository.adapter';
import { CoupangProductSalesScrapeAdapter } from './adapter/out/coupang/coupang-product-sales-scrape.adapter';
import { DetailPageGeminiMediaAdapter } from './adapter/out/gemini/detail-page-gemini-media.adapter';
import { TEXT_JUDGEMENT_PORT } from './application/port/in/capability/text-judgement.port';
import { TextJudgementService } from './application/service/text-judgement.service';
import { GeminiTextCompletionAdapter } from './adapter/out/gemini/gemini-text-completion.adapter';
import { GeminiThumbnailVisionAdapter } from './adapter/out/gemini/gemini-thumbnail-vision.adapter';
import { ImageEditGeminiMediaAdapter } from './adapter/out/gemini/image-edit-gemini-media.adapter';
import { ThumbnailImageGenerationAdapter } from './adapter/out/gemini/thumbnail-image-generation.adapter';
import { ThumbnailReferenceImagesService } from './adapter/out/gemini/thumbnail-reference-images.adapter';
import { ThumbnailImageFetcherService } from './adapter/out/image-fetch/thumbnail-image-fetcher.adapter';
import { SharpGeneratedImageValidatorAdapter } from './adapter/out/image-validation/sharp-generated-image-validator.adapter';
import { DetailPageTemplateStylesAdapter } from './adapter/out/runtime/detail-page-template-styles.adapter';
import { ThumbnailGenerationEventAdapter } from './adapter/out/repository/thumbnail-generation-event.adapter';
import { ContentArchiveRepositoryAdapter } from './adapter/out/repository/content-archive.repository.adapter';
import { ContentAssetLibraryRepositoryAdapter } from './adapter/out/repository/content-asset-library.repository.adapter';
import { ContentWorkspaceLifecycleRepositoryAdapter } from './adapter/out/repository/content-workspace-lifecycle.repository.adapter';
import { RegistrationContentWorkspaceRepositoryAdapter } from './adapter/out/repository/registration-content-workspace.repository.adapter';
import { DetailPageGenerationRepositoryAdapter } from './adapter/out/repository/detail-page-generation.repository.adapter';
import { DetailPageQueryRepositoryAdapter } from './adapter/out/repository/detail-page-query.repository.adapter';
import { DetailPageImageRepositoryAdapter } from './adapter/out/repository/detail-page-image.repository.adapter';
import { ProductGenerationContextRepositoryAdapter } from './adapter/out/repository/product-generation-context.repository.adapter';
import { SalesProductWorkspaceArchiveRepositoryAdapter } from './adapter/out/repository/sales-product-workspace-archive.repository.adapter';
import { ThumbnailAnalysisRepositoryAdapter } from './adapter/out/repository/thumbnail-analysis.repository.adapter';
import { ThumbnailGenerationLedgerRepositoryAdapter } from './adapter/out/repository/thumbnail-generation-ledger.repository.adapter';
import { ThumbnailTrackingRepositoryAdapter } from './adapter/out/repository/thumbnail-tracking.repository.adapter';
import { RegistrableThumbnailRepositoryAdapter } from './adapter/out/repository/registrable-thumbnail.repository.adapter';
// application/service
import { ImageAiService } from './application/service/image-ai.service';
import { ImageEditDirectGenerationExecutorService } from './application/service/image-edit-direct-generation-executor.service';
import { ImageEditDirectGenerationJobService } from './application/service/image-edit-direct-generation-job.service';
import { TextAiService } from './application/service/text-ai.service';
import { ThumbnailAnalysisService } from './application/service/thumbnail-analysis.service';
import { ThumbnailAnalysisAnalyzerService } from './application/service/thumbnail-analysis-analyzer.service';
import { ThumbnailAnalysisBatchService } from './application/service/thumbnail-analysis-batch.service';
import { ThumbnailAnalysisQueryService } from './application/service/thumbnail-analysis-query.service';
import { ThumbnailAutoService } from './application/service/thumbnail-auto.service';
import { DetailPageHeroImageService } from './application/service/detail-page-hero-image.service';
import { DetailPageGeneratedImagesService } from './application/service/detail-page-generated-images.service';
import { DetailPageDirectGenerationExecutorService } from './application/service/detail-page-direct-generation-executor.service';
import { DetailPageDirectGenerationJobService } from './application/service/detail-page-direct-generation-job.service';
import { ContentAssetService } from './application/service/content-asset.service';
import { DetailPageAiService } from './application/service/detail-page-ai.service';
import { DetailPageGenerationService } from './application/service/detail-page-generation.service';
import { DetailPageClientRenderService } from './application/service/detail-page-client-render.service';
import { DetailPageRasterizationService } from './application/service/detail-page-rasterization.service';
import { DetailPagePrefillService } from './application/service/detail-page-prefill.service';
import { DetailPageQueryService } from './application/service/detail-page-query.service';
import { DetailPageResultRefinerService } from './application/service/detail-page-result-refiner.service';
import { ImageAssetOperationService } from './application/service/image-asset-operation.service';
import { ProductGenerationAiService } from './application/service/product-generation-ai.service';
import { BoldVerticalRefinerService } from './application/service/bold-vertical-refiner.service';
import { KidsPlayfulRefinerService } from './application/service/kids-playful-refiner.service';
import { ThumbnailComplianceVerifierService } from './application/service/thumbnail-compliance-verifier.service';
import { ThumbnailDirectGenerationExecutorService } from './application/service/thumbnail-direct-generation-executor.service';
import { ThumbnailDirectGenerationJobService } from './application/service/thumbnail-direct-generation-job.service';
import { ThumbnailEditorAiService } from './application/service/thumbnail-editor-ai.service';
import { ThumbnailGenerationJobService } from './application/service/thumbnail-generation-job.service';
import { ThumbnailGenerationLifecycleService } from './application/service/thumbnail-generation-lifecycle.service';
import { ThumbnailGenerationService } from './application/service/thumbnail-generation.service';
import { ThumbnailRecomposeService } from './application/service/thumbnail-recompose.service';
import { ThumbnailTrackingService } from './application/service/thumbnail-tracking.service';
import { ThumbnailVisionAiService } from './application/service/thumbnail-vision-ai.service';
import { RegistrableThumbnailService } from './application/service/registrable-thumbnail.service';
import { ContentArchiveService } from './application/service/content-archive.service';
import { ContentGenerationRerunService } from './application/service/content-generation-rerun.service';
import { ContentWorkspaceService } from './application/service/content-workspace.service';
import { RegistrationContentWorkspaceService } from './application/service/registration-content-workspace.service';
import { SalesProductWorkspaceArchiveService } from './application/service/sales-product-workspace-archive.service';
import { AiGenerationCancellationService } from './application/service/ai-generation-cancellation.service';
import { AiDirectJobInputAssetsService } from './application/service/ai-direct-job-input-assets.service';
import { AiDirectJobPayloadHydratorService } from './application/service/ai-direct-job-payload-hydrator.service';
import { AiDirectJobProcessorService } from './application/service/ai-direct-job-processor.service';
import { AiDirectJobWorkerService } from './application/service/ai-direct-job-worker.service';
import { AiUsageService } from './application/service/ai-usage.service';
import { AI_USAGE_REPOSITORY_PORT } from './application/port/out/repository/ai-usage.repository.port';
import { AiUsageRepositoryAdapter } from './adapter/out/repository/ai-usage.repository.adapter';
import { AiUsageController } from './adapter/in/http/ai-usage.controller';
import { AiDirectJobWakeRegistrationService } from './application/service/ai-direct-job-wake-registration.service';
import { CatalogDisplayMediaService } from './application/service/catalog-display-media.service';
import {
  AI_DIRECT_JOB_RUNTIME_CONFIG,
  resolveAiDirectJobRuntimeConfig,
} from './application/service/ai-direct-job.config';
// application/port — in
import { REGISTRABLE_THUMBNAIL_PORT } from './application/port/in/workspace/registrable-thumbnail.port';
import {
  AI_GENERATION_CANCELLATION_PORT,
  PRODUCT_GENERATION_AI_TRIGGER_PORT,
} from './application/port/in/generation';
import {
  AI_WORKSPACE_ARCHIVE_PORT,
  SALES_PRODUCT_CONTENT_ASSET_PORT,
  CATALOG_DISPLAY_MEDIA_PORT,
  REGISTRATION_CONTENT_WORKSPACE_PORT,
} from './application/port/in/workspace';
// application/port — out
import { THUMBNAIL_GENERATION_EVENT_PORT } from './application/port/out/event';
import {
  COUPANG_PRODUCT_SALES_SCRAPE_PORT,
  DETAIL_PAGE_MEDIA_PORT,
  GENERATED_IMAGE_VALIDATOR_PORT,
  IMAGE_EDIT_MEDIA_PORT,
  IMAGE_FETCH_PORT,
  TEXT_COMPLETION_PORT,
  THUMBNAIL_IMAGE_GENERATION_PORT,
  THUMBNAIL_REFERENCE_IMAGES_PORT,
  THUMBNAIL_VISION_PROVIDER_PORT,
} from './application/port/out/provider';
import {
  AI_DIRECT_JOB_REPOSITORY_PORT,
  CATALOG_DISPLAY_MEDIA_REPOSITORY_PORT,
  CONTENT_ARCHIVE_REPOSITORY_PORT,
  CONTENT_ASSET_LIBRARY_REPOSITORY_PORT,
  CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT,
  DETAIL_PAGE_GENERATION_REPOSITORY_PORT,
  DETAIL_PAGE_IMAGE_REPOSITORY_PORT,
  DETAIL_PAGE_QUERY_REPOSITORY_PORT,
  PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT,
  REGISTRATION_CONTENT_WORKSPACE_REPOSITORY_PORT,
  SALES_PRODUCT_WORKSPACE_ARCHIVE_REPOSITORY_PORT,
  THUMBNAIL_ANALYSIS_REPOSITORY_PORT,
  THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT,
  THUMBNAIL_TRACKING_REPOSITORY_PORT,
  REGISTRABLE_THUMBNAIL_REPOSITORY_PORT,
} from './application/port/out/repository';
import {
  AI_DIRECT_JOB_WAKE_PORT,
  DETAIL_PAGE_TEMPLATE_STYLES_PORT,
} from './application/port/out/runtime';
import {
  DETAIL_PAGE_DIRECT_OUTPUT_SINK_PORT,
  THUMBNAIL_DIRECT_OUTPUT_SINK_PORT,
} from './application/port/out/sink';
import { IMAGE_STORAGE_PORT } from './application/port/out/storage';

/**
 * Controller-free owner composition for the listing product-generation path.
 * It deliberately excludes Agent OS API/HTTP and the direct-job worker; callers
 * receive only the owner trigger port and enqueue durable jobs for API workers.
 */
@Module({
  // Channels 는 판매상품 초안을 내릴 때 AI 작업공간을 보관한다(AiModule 을 forwardRef 로
  // 문다). AI 는 그 반대편에서 SalesProductModule 을 바로 가져와도 된다 — 순환은 이미 그
  // 한쪽에서 끊겼다.
  imports: [ChannelCatalogModule, SalesProductModule, PrismaModule, StorageModule],
  providers: [
    ProductGenerationAiService,
    ContentWorkspaceService,
    DetailPageGenerationService,
    DetailPageQueryService,
    DetailPageResultRefinerService,
    BoldVerticalRefinerService,
    KidsPlayfulRefinerService,
    DetailPageDirectGenerationJobService,
    ThumbnailEditorAiService,
    ThumbnailGenerationJobService,
    ThumbnailGenerationLifecycleService,
    ThumbnailDirectGenerationJobService,
    AiDirectJobRepositoryAdapter,
    ContentAssetLibraryRepositoryAdapter,
    ContentWorkspaceLifecycleRepositoryAdapter,
    SalesProductOwnerReadAdapter,
    DetailPageGenerationRepositoryAdapter,
    DetailPageQueryRepositoryAdapter,
    ProductGenerationContextRepositoryAdapter,
    ThumbnailGenerationEventAdapter,
    ThumbnailGenerationLedgerRepositoryAdapter,
    ThumbnailImageFetcherService,
    SharpGeneratedImageValidatorAdapter,
    ThumbnailImageGenerationAdapter,
    ThumbnailReferenceImagesService,
    { provide: AI_DIRECT_JOB_RUNTIME_CONFIG, useFactory: resolveAiDirectJobRuntimeConfig },
    { provide: AI_DIRECT_JOB_REPOSITORY_PORT, useExisting: AiDirectJobRepositoryAdapter },
    { provide: CONTENT_ASSET_LIBRARY_REPOSITORY_PORT, useExisting: ContentAssetLibraryRepositoryAdapter },
    { provide: CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT, useExisting: ContentWorkspaceLifecycleRepositoryAdapter },
    { provide: SALES_PRODUCT_OWNER_READ_PORT, useExisting: SalesProductOwnerReadAdapter },
    { provide: DETAIL_PAGE_GENERATION_REPOSITORY_PORT, useExisting: DetailPageGenerationRepositoryAdapter },
    { provide: DETAIL_PAGE_QUERY_REPOSITORY_PORT, useExisting: DetailPageQueryRepositoryAdapter },
    { provide: GENERATED_IMAGE_VALIDATOR_PORT, useExisting: SharpGeneratedImageValidatorAdapter },
    { provide: IMAGE_FETCH_PORT, useExisting: ThumbnailImageFetcherService },
    { provide: IMAGE_STORAGE_PORT, useExisting: StorageService },
    { provide: PRODUCT_GENERATION_AI_TRIGGER_PORT, useExisting: ProductGenerationAiService },
    { provide: PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT, useExisting: ProductGenerationContextRepositoryAdapter },
    { provide: THUMBNAIL_GENERATION_EVENT_PORT, useExisting: ThumbnailGenerationEventAdapter },
    { provide: THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT, useExisting: ThumbnailGenerationLedgerRepositoryAdapter },
    { provide: THUMBNAIL_IMAGE_GENERATION_PORT, useExisting: ThumbnailImageGenerationAdapter },
    { provide: THUMBNAIL_REFERENCE_IMAGES_PORT, useExisting: ThumbnailReferenceImagesService },
  ],
  exports: [
    PRODUCT_GENERATION_AI_TRIGGER_PORT,
    AI_DIRECT_JOB_REPOSITORY_PORT,
    AI_DIRECT_JOB_RUNTIME_CONFIG,
    CONTENT_ASSET_LIBRARY_REPOSITORY_PORT,
    CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT,
    DETAIL_PAGE_GENERATION_REPOSITORY_PORT,
    DETAIL_PAGE_QUERY_REPOSITORY_PORT,
    GENERATED_IMAGE_VALIDATOR_PORT,
    IMAGE_FETCH_PORT,
    IMAGE_STORAGE_PORT,
    PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT,
    THUMBNAIL_GENERATION_EVENT_PORT,
    THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT,
    THUMBNAIL_IMAGE_GENERATION_PORT,
    THUMBNAIL_REFERENCE_IMAGES_PORT,
    ContentWorkspaceService,
    DetailPageDirectGenerationJobService,
    DetailPageGenerationService,
    DetailPageQueryService,
    DetailPageResultRefinerService,
    ThumbnailDirectGenerationJobService,
    ThumbnailEditorAiService,
    ThumbnailGenerationJobService,
    ThumbnailGenerationLifecycleService,
  ],
})
export class AiProductGenerationRuntimeModule {}

@Module({
  imports: [
    ChannelCatalogModule,
    PrismaModule,
    AgentOsCapabilityModule,
    StorageModule,
    AiProductGenerationRuntimeModule,
  ],
  providers: [
    DetailPageHeroImageService,
    DetailPageResultRefinerService,
    BoldVerticalRefinerService,
    KidsPlayfulRefinerService,
    DetailPageGeminiMediaAdapter,
    RegistrableThumbnailRepositoryAdapter,
    RegistrableThumbnailService,
    { provide: DETAIL_PAGE_MEDIA_PORT, useExisting: DetailPageGeminiMediaAdapter },
    { provide: REGISTRABLE_THUMBNAIL_REPOSITORY_PORT, useExisting: RegistrableThumbnailRepositoryAdapter },
    // 몰 반영 실행(Channels)이 읽는 승인 썸네일과 그 사진.
    { provide: REGISTRABLE_THUMBNAIL_PORT, useExisting: RegistrableThumbnailService },
  ],
  exports: [
    AiProductGenerationRuntimeModule,
    DETAIL_PAGE_MEDIA_PORT,
    REGISTRABLE_THUMBNAIL_PORT,
  ],
})
export class AiAgentRuntimeModule {}

@Module({
  imports: [ChannelCatalogModule, AiAgentRuntimeModule],
  providers: [
    AiUsageRepositoryAdapter,
    { provide: AI_USAGE_REPOSITORY_PORT, useExisting: AiUsageRepositoryAdapter },
    AiUsageService,
    ImageAiService,
    ImageEditDirectGenerationExecutorService,
    ImageEditDirectGenerationJobService,
    AiDirectJobInputAssetsService,
    AiDirectJobPayloadHydratorService,
    AiDirectJobProcessorService,
    AiDirectJobWorkerService,
    AiDirectJobWakeRegistrationService,
    CatalogDisplayMediaService,
    AiGenerationCancellationService,
    ImageAssetOperationService,
    DetailPageAiService,
    DetailPageClientRenderService,
    DetailPageRasterizationService,
    ContentArchiveService,
    ContentAssetService,
    ContentGenerationRerunService,
    RegistrationContentWorkspaceService,
    SalesProductWorkspaceArchiveService,
    DetailPageDirectGenerationExecutorService,
    DetailPageGeneratedImagesService,
    DetailPagePrefillService,
    TextAiService,
    ThumbnailAnalysisService,
    ThumbnailAnalysisAnalyzerService,
    ThumbnailAnalysisBatchService,
    ThumbnailAnalysisQueryService,
    ThumbnailAutoService,
    ThumbnailComplianceVerifierService,
    ThumbnailDirectGenerationExecutorService,
    ThumbnailGenerationService,
    ThumbnailRecomposeService,
    ThumbnailTrackingService,
    ThumbnailVisionAiService,
    AiCatalogMediaPublicationRepositoryAdapter,
    CatalogDisplayMediaRepositoryAdapter,
    DetailPageContentGenerationSinkAdapter,
    ThumbnailGenerationSinkAdapter,
    CoupangProductSalesScrapeAdapter,
    GeminiTextCompletionAdapter,
    GeminiThumbnailVisionAdapter,
    ImageEditGeminiMediaAdapter,
    ContentArchiveRepositoryAdapter,
    RegistrationContentWorkspaceRepositoryAdapter,
    DetailPageImageRepositoryAdapter,
    SalesProductWorkspaceArchiveRepositoryAdapter,
    ThumbnailAnalysisRepositoryAdapter,
    ThumbnailTrackingRepositoryAdapter,
    DetailPageTemplateStylesAdapter,
    {
      provide: AI_DIRECT_JOB_WAKE_PORT,
      useExisting: AiDirectJobWorkerService,
    },
    {
      provide: DETAIL_PAGE_TEMPLATE_STYLES_PORT,
      useExisting: DetailPageTemplateStylesAdapter,
    },
    {
      provide: CATALOG_DISPLAY_MEDIA_REPOSITORY_PORT,
      useExisting: CatalogDisplayMediaRepositoryAdapter,
    },
    {
      provide: COUPANG_PRODUCT_SALES_SCRAPE_PORT,
      useExisting: CoupangProductSalesScrapeAdapter,
    },
    {
      provide: DETAIL_PAGE_DIRECT_OUTPUT_SINK_PORT,
      useExisting: DetailPageContentGenerationSinkAdapter,
    },
    {
      provide: THUMBNAIL_DIRECT_OUTPUT_SINK_PORT,
      useExisting: ThumbnailGenerationSinkAdapter,
    },
    { provide: IMAGE_EDIT_MEDIA_PORT, useExisting: ImageEditGeminiMediaAdapter },
    {
      provide: THUMBNAIL_VISION_PROVIDER_PORT,
      useExisting: GeminiThumbnailVisionAdapter,
    },
    {
      provide: CONTENT_ARCHIVE_REPOSITORY_PORT,
      useExisting: ContentArchiveRepositoryAdapter,
    },
    {
      provide: DETAIL_PAGE_IMAGE_REPOSITORY_PORT,
      useExisting: DetailPageImageRepositoryAdapter,
    },
    {
      provide: REGISTRATION_CONTENT_WORKSPACE_REPOSITORY_PORT,
      useExisting: RegistrationContentWorkspaceRepositoryAdapter,
    },
    {
      provide: SALES_PRODUCT_WORKSPACE_ARCHIVE_REPOSITORY_PORT,
      useExisting: SalesProductWorkspaceArchiveRepositoryAdapter,
    },
    {
      provide: THUMBNAIL_ANALYSIS_REPOSITORY_PORT,
      useExisting: ThumbnailAnalysisRepositoryAdapter,
    },
    {
      provide: THUMBNAIL_TRACKING_REPOSITORY_PORT,
      useExisting: ThumbnailTrackingRepositoryAdapter,
    },
    { provide: TEXT_COMPLETION_PORT, useExisting: GeminiTextCompletionAdapter },
    TextJudgementService,
    { provide: TEXT_JUDGEMENT_PORT, useExisting: TextJudgementService },
    {
      provide: CATALOG_MEDIA_PUBLICATION_PORT,
      useExisting: AiCatalogMediaPublicationRepositoryAdapter,
    },
    {
      provide: AI_WORKSPACE_ARCHIVE_PORT,
      useExisting: SalesProductWorkspaceArchiveService,
    },
    {
      provide: AI_GENERATION_CANCELLATION_PORT,
      useExisting: AiGenerationCancellationService,
    },
    {
      provide: REGISTRATION_CONTENT_WORKSPACE_PORT,
      useExisting: RegistrationContentWorkspaceService,
    },
    { provide: SALES_PRODUCT_CONTENT_ASSET_PORT, useExisting: ContentAssetService },
    { provide: CATALOG_DISPLAY_MEDIA_PORT, useExisting: CatalogDisplayMediaService },
  ],
  controllers: [
    AiUsageController,
    ContentArchiveController,
    ContentArchiveLinkageController,
    ContentAssetController,
    ContentGenerationRerunController,
    DetailPageWorkspaceImageController,
    DetailPageEditorController,
    DetailPageGenerationController,
    ImageAiController,
    ContentWorkspaceController,
    RenderImageController,
    TextAiController,
    ThumbnailAnalysisController,
    ThumbnailAnalysisEditJobsController,
    ThumbnailAnalysisGenerationReviewController,
    ThumbnailAutoController,
    ThumbnailEditorController,
    ThumbnailTrackingController,
  ],
  exports: [
    AiAgentRuntimeModule,
    ContentArchiveService,
    ContentAssetService,
    ContentGenerationRerunService,
    DetailPageAiService,
    DetailPageClientRenderService,
    DetailPageRasterizationService,
    ImageAiService,
    ImageAssetOperationService,
    TextAiService,
    ThumbnailAnalysisService,
    ThumbnailAutoService,
    ThumbnailGenerationService,
    ThumbnailRecomposeService,
    ThumbnailTrackingService,
    TEXT_JUDGEMENT_PORT,
    AI_WORKSPACE_ARCHIVE_PORT,
    AI_GENERATION_CANCELLATION_PORT,
    REGISTRATION_CONTENT_WORKSPACE_PORT,
    SALES_PRODUCT_CONTENT_ASSET_PORT,
    CATALOG_MEDIA_PUBLICATION_PORT,
    CATALOG_DISPLAY_MEDIA_PORT,
  ],
})
export class AiModule {}
