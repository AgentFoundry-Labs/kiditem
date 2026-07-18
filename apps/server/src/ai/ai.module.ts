import { Module } from '@nestjs/common';
import { StorageService } from '../common/storage/storage.service';
import { StorageModule } from '../common/storage/storage.module';
import { AgentOsModule } from '../agent-os/agent-os.module';
import { AutomationModule } from '../automation/automation.module';

// adapter/in/http
import { ImageAiController } from './adapter/in/http/image-ai.controller';
import { ContentArchiveController } from './adapter/in/http/content-archive.controller';
import { ContentArchiveLinkageController } from './adapter/in/http/content-archive-linkage.controller';
import { ContentAssetController } from './adapter/in/http/content-asset.controller';
import { ContentGenerationRerunController } from './adapter/in/http/content-generation-rerun.controller';
import { DetailPageCandidateImageController } from './adapter/in/http/detail-page-candidate-image.controller';
import { DetailPageEditorController } from './adapter/in/http/detail-page-editor.controller';
import { DetailPageGenerationController } from './adapter/in/http/detail-page-generation.controller';
import { RenderImageController } from './adapter/in/http/render-image.controller';
import { ContentWorkspaceController } from './adapter/in/http/content-workspace.controller';
import { TextAiController } from './adapter/in/http/text-ai.controller';
import { ThumbnailAnalysisController } from './adapter/in/http/thumbnail-analysis.controller';
import { ThumbnailAnalysisEditJobsController } from './adapter/in/http/thumbnail-analysis-edit-jobs.controller';
import { ThumbnailAnalysisGenerationReviewController } from './adapter/in/http/thumbnail-analysis-generation-review.controller';
import { ThumbnailAnalysisWingController } from './adapter/in/http/thumbnail-analysis-wing.controller';
import { ThumbnailAutoController } from './adapter/in/http/thumbnail-auto.controller';
import { ThumbnailEditorController } from './adapter/in/http/thumbnail-editor.controller';
import { ThumbnailTrackingController } from './adapter/in/http/thumbnail-tracking.controller';

// adapter/in/agent
import { AiWingRegistrationCapabilityAdapter } from './adapter/in/agent/ai-wing-registration-capability.adapter';

// adapter/out
import { DetailPageContentGenerationSinkAdapter } from './adapter/out/direct-output/detail-page-content-generation-sink.adapter';
import { ThumbnailGenerationSinkAdapter } from './adapter/out/direct-output/thumbnail-generation-sink.adapter';
import { AiOperationAlertAdapter } from './adapter/out/automation/operation-alert.adapter';
import { AiCatalogMediaPublicationRepositoryAdapter } from './adapter/out/repository/ai-catalog-media-publication.repository.adapter';
import { CoupangProductSalesScrapeAdapter } from './adapter/out/coupang/coupang-product-sales-scrape.adapter';
import { DetailPageGeminiMediaAdapter } from './adapter/out/gemini/detail-page-gemini-media.adapter';
import { GeminiTextCompletionAdapter } from './adapter/out/gemini/gemini-text-completion.adapter';
import { GeminiThumbnailVisionAdapter } from './adapter/out/gemini/gemini-thumbnail-vision.adapter';
import { ImageEditGeminiMediaAdapter } from './adapter/out/gemini/image-edit-gemini-media.adapter';
import { ThumbnailImageGenerationAdapter } from './adapter/out/gemini/thumbnail-image-generation.adapter';
import { ThumbnailReferenceImagesService } from './adapter/out/gemini/thumbnail-reference-images.adapter';
import { ThumbnailImageFetcherService } from './adapter/out/image-fetch/thumbnail-image-fetcher.adapter';
import { DetailPageTemplateStylesAdapter } from './adapter/out/runtime/detail-page-template-styles.adapter';
import { ThumbnailGenerationEventAdapter } from './adapter/out/repository/thumbnail-generation-event.adapter';
import { ContentArchiveRepositoryAdapter } from './adapter/out/repository/content-archive.repository.adapter';
import { ContentAssetLibraryRepositoryAdapter } from './adapter/out/repository/content-asset-library.repository.adapter';
import { ContentWorkspaceLifecycleRepositoryAdapter } from './adapter/out/repository/content-workspace-lifecycle.repository.adapter';
import { ContentWorkspaceThumbnailSelectionRepositoryAdapter } from './adapter/out/repository/content-workspace-thumbnail-selection.repository.adapter';
import { RegistrationContentWorkspaceRepositoryAdapter } from './adapter/out/repository/registration-content-workspace.repository.adapter';
import { DetailPageGenerationRepositoryAdapter } from './adapter/out/repository/detail-page-generation.repository.adapter';
import { DetailPageQueryRepositoryAdapter } from './adapter/out/repository/detail-page-query.repository.adapter';
import { ProductGenerationContextRepositoryAdapter } from './adapter/out/repository/product-generation-context.repository.adapter';
import { ProductGenerationChildLedgerRepositoryAdapter } from './adapter/out/repository/product-generation-child-ledger.repository.adapter';
import { SourcingWorkspaceArchiveRepositoryAdapter } from './adapter/out/repository/sourcing-workspace-archive.repository.adapter';
import { ThumbnailAnalysisRepositoryAdapter } from './adapter/out/repository/thumbnail-analysis.repository.adapter';
import { ThumbnailGenerationLedgerRepositoryAdapter } from './adapter/out/repository/thumbnail-generation-ledger.repository.adapter';
import { ThumbnailTrackingRepositoryAdapter } from './adapter/out/repository/thumbnail-tracking.repository.adapter';
import { ThumbnailWingRepositoryAdapter } from './adapter/out/repository/thumbnail-wing.repository.adapter';
import { WingAutomationRunner } from './adapter/out/wing/wing-automation-runner';

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
import { DetailPageCandidateImageService } from './application/service/detail-page-candidate-image.service';
import { DetailPageRasterizationService } from './application/service/detail-page-rasterization.service';
import { DetailPagePrefillService } from './application/service/detail-page-prefill.service';
import { DetailPageQueryService } from './application/service/detail-page-query.service';
import { DetailPageResultRefinerService } from './application/service/detail-page-result-refiner.service';
import { ImageAssetOperationService } from './application/service/image-asset-operation.service';
import { ProductGenerationAiService } from './application/service/product-generation-ai.service';
import { ProductGenerationAlertService } from './application/service/product-generation-alert.service';
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
import { ThumbnailWingService } from './application/service/thumbnail-wing.service';
import { ContentArchiveService } from './application/service/content-archive.service';
import { ContentGenerationRerunService } from './application/service/content-generation-rerun.service';
import { ContentWorkspaceService } from './application/service/content-workspace.service';
import { ContentWorkspaceThumbnailSelectionService } from './application/service/content-workspace-thumbnail-selection.service';
import { RegistrationContentWorkspaceService } from './application/service/registration-content-workspace.service';
import { SourcingWorkspaceArchiveService } from './application/service/sourcing-workspace-archive.service';
import { AiGenerationCancellationService } from './application/service/ai-generation-cancellation.service';

// application/port — in
import { AI_WING_REGISTRATION_CAPABILITY_PORT } from './application/port/in/capability/wing-registration.port';
import {
  AI_GENERATION_CANCELLATION_PORT,
  PRODUCT_GENERATION_AI_TRIGGER_PORT,
} from './application/port/in/generation';
import {
  AI_WORKSPACE_ARCHIVE_PORT,
  CANDIDATE_CONTENT_ASSET_PORT,
  REGISTRATION_CONTENT_WORKSPACE_PORT,
} from './application/port/in/workspace';

// application/port — out
import { AI_OPERATION_ALERT_PORT } from './application/port/out/cross-domain';
import { CATALOG_MEDIA_PUBLICATION_PORT } from '../channels/application/port/out/cross-domain/catalog-media-publication.port';
import { THUMBNAIL_GENERATION_EVENT_PORT } from './application/port/out/event';
import {
  COUPANG_PRODUCT_SALES_SCRAPE_PORT,
  DETAIL_PAGE_MEDIA_PORT,
  IMAGE_EDIT_MEDIA_PORT,
  IMAGE_FETCH_PORT,
  TEXT_COMPLETION_PORT,
  THUMBNAIL_IMAGE_GENERATION_PORT,
  THUMBNAIL_REFERENCE_IMAGES_PORT,
  THUMBNAIL_VISION_PROVIDER_PORT,
} from './application/port/out/provider';
import {
  CONTENT_ARCHIVE_REPOSITORY_PORT,
  CONTENT_ASSET_LIBRARY_REPOSITORY_PORT,
  CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT,
  CONTENT_WORKSPACE_THUMBNAIL_SELECTION_REPOSITORY_PORT,
  DETAIL_PAGE_GENERATION_REPOSITORY_PORT,
  DETAIL_PAGE_QUERY_REPOSITORY_PORT,
  PRODUCT_GENERATION_CHILD_LEDGER_REPOSITORY_PORT,
  PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT,
  REGISTRATION_CONTENT_WORKSPACE_REPOSITORY_PORT,
  SOURCING_WORKSPACE_ARCHIVE_REPOSITORY_PORT,
  THUMBNAIL_ANALYSIS_REPOSITORY_PORT,
  THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT,
  THUMBNAIL_TRACKING_REPOSITORY_PORT,
  THUMBNAIL_WING_REPOSITORY_PORT,
} from './application/port/out/repository';
import {
  DETAIL_PAGE_TEMPLATE_STYLES_PORT,
  WING_AUTOMATION_PORT,
} from './application/port/out/runtime';
import {
  DETAIL_PAGE_DIRECT_OUTPUT_SINK_PORT,
  THUMBNAIL_DIRECT_OUTPUT_SINK_PORT,
} from './application/port/out/sink';
import { IMAGE_STORAGE_PORT } from './application/port/out/storage';

@Module({
  imports: [AutomationModule, AgentOsModule, StorageModule],
  controllers: [
    ContentArchiveController,
    ContentArchiveLinkageController,
    ContentAssetController,
    ContentGenerationRerunController,
    DetailPageCandidateImageController,
    DetailPageEditorController,
    DetailPageGenerationController,
    ImageAiController,
    ContentWorkspaceController,
    RenderImageController,
    TextAiController,
    ThumbnailAnalysisController,
    ThumbnailAnalysisEditJobsController,
    ThumbnailAnalysisGenerationReviewController,
    ThumbnailAnalysisWingController,
    ThumbnailAutoController,
    ThumbnailEditorController,
    ThumbnailTrackingController,
  ],
  providers: [
    // application services
    ImageAiService,
    ImageEditDirectGenerationExecutorService,
    ImageEditDirectGenerationJobService,
    AiGenerationCancellationService,
    ImageAssetOperationService,
    DetailPageAiService,
    DetailPageCandidateImageService,
    DetailPageGenerationService,
    DetailPageRasterizationService,
    ContentArchiveService,
    ContentAssetService,
    ContentGenerationRerunService,
    ContentWorkspaceService,
    ContentWorkspaceThumbnailSelectionService,
    RegistrationContentWorkspaceService,
    SourcingWorkspaceArchiveService,
    DetailPageDirectGenerationExecutorService,
    DetailPageDirectGenerationJobService,
    DetailPageGeneratedImagesService,
    DetailPageHeroImageService,
    DetailPagePrefillService,
    DetailPageQueryService,
    DetailPageResultRefinerService,
    BoldVerticalRefinerService,
    KidsPlayfulRefinerService,
    ProductGenerationAiService,
    ProductGenerationAlertService,
    TextAiService,
    ThumbnailAnalysisService,
    ThumbnailAnalysisAnalyzerService,
    ThumbnailAnalysisBatchService,
    ThumbnailAnalysisQueryService,
    ThumbnailAutoService,
    ThumbnailComplianceVerifierService,
    ThumbnailDirectGenerationExecutorService,
    ThumbnailDirectGenerationJobService,
    ThumbnailEditorAiService,
    ThumbnailGenerationJobService,
    ThumbnailGenerationLifecycleService,
    ThumbnailGenerationService,
    ThumbnailRecomposeService,
    ThumbnailTrackingService,
    ThumbnailVisionAiService,
    ThumbnailWingService,
    AiWingRegistrationCapabilityAdapter,
    AiCatalogMediaPublicationRepositoryAdapter,

    // outgoing adapters
    DetailPageContentGenerationSinkAdapter,
    DetailPageGeminiMediaAdapter,
    ThumbnailGenerationSinkAdapter,
    CoupangProductSalesScrapeAdapter,
    GeminiTextCompletionAdapter,
    GeminiThumbnailVisionAdapter,
    ImageEditGeminiMediaAdapter,
    ThumbnailImageGenerationAdapter,
    ContentArchiveRepositoryAdapter,
    ContentAssetLibraryRepositoryAdapter,
    ContentWorkspaceLifecycleRepositoryAdapter,
    ContentWorkspaceThumbnailSelectionRepositoryAdapter,
    RegistrationContentWorkspaceRepositoryAdapter,
    DetailPageGenerationRepositoryAdapter,
    DetailPageQueryRepositoryAdapter,
    ProductGenerationContextRepositoryAdapter,
    ProductGenerationChildLedgerRepositoryAdapter,
    SourcingWorkspaceArchiveRepositoryAdapter,
    ThumbnailAnalysisRepositoryAdapter,
    ThumbnailGenerationLedgerRepositoryAdapter,
    ThumbnailTrackingRepositoryAdapter,
    ThumbnailWingRepositoryAdapter,
    ThumbnailGenerationEventAdapter,
    ThumbnailImageFetcherService,
    ThumbnailReferenceImagesService,
    DetailPageTemplateStylesAdapter,
    WingAutomationRunner,
    AiOperationAlertAdapter,

    // port bindings
    {
      provide: DETAIL_PAGE_TEMPLATE_STYLES_PORT,
      useExisting: DetailPageTemplateStylesAdapter,
    },
    { provide: WING_AUTOMATION_PORT, useExisting: WingAutomationRunner },
    { provide: COUPANG_PRODUCT_SALES_SCRAPE_PORT, useExisting: CoupangProductSalesScrapeAdapter },
    {
      // Real sink — applies validated detail-page output to the originating
      // ContentGeneration row (READY/FAILED + processedImages + operation
      // alert close).
      provide: DETAIL_PAGE_DIRECT_OUTPUT_SINK_PORT,
      useExisting: DetailPageContentGenerationSinkAdapter,
    },
    {
      // Real sink — applies validated thumbnail output to the originating
      // ThumbnailGeneration row (succeeded/failed + candidates + status
      // events + operation alert close).
      provide: THUMBNAIL_DIRECT_OUTPUT_SINK_PORT,
      useExisting: ThumbnailGenerationSinkAdapter,
    },
    { provide: IMAGE_FETCH_PORT, useExisting: ThumbnailImageFetcherService },
    { provide: IMAGE_EDIT_MEDIA_PORT, useExisting: ImageEditGeminiMediaAdapter },
    { provide: IMAGE_STORAGE_PORT, useExisting: StorageService },
    { provide: THUMBNAIL_IMAGE_GENERATION_PORT, useExisting: ThumbnailImageGenerationAdapter },
    { provide: THUMBNAIL_REFERENCE_IMAGES_PORT, useExisting: ThumbnailReferenceImagesService },
    { provide: THUMBNAIL_VISION_PROVIDER_PORT, useExisting: GeminiThumbnailVisionAdapter },
    { provide: DETAIL_PAGE_MEDIA_PORT, useExisting: DetailPageGeminiMediaAdapter },
    {
      provide: CONTENT_ARCHIVE_REPOSITORY_PORT,
      useExisting: ContentArchiveRepositoryAdapter,
    },
    {
      provide: CONTENT_ASSET_LIBRARY_REPOSITORY_PORT,
      useExisting: ContentAssetLibraryRepositoryAdapter,
    },
    {
      provide: CONTENT_WORKSPACE_LIFECYCLE_REPOSITORY_PORT,
      useExisting: ContentWorkspaceLifecycleRepositoryAdapter,
    },
    {
      provide: CONTENT_WORKSPACE_THUMBNAIL_SELECTION_REPOSITORY_PORT,
      useExisting: ContentWorkspaceThumbnailSelectionRepositoryAdapter,
    },
    {
      provide: DETAIL_PAGE_GENERATION_REPOSITORY_PORT,
      useExisting: DetailPageGenerationRepositoryAdapter,
    },
    {
      provide: DETAIL_PAGE_QUERY_REPOSITORY_PORT,
      useExisting: DetailPageQueryRepositoryAdapter,
    },
    {
      provide: REGISTRATION_CONTENT_WORKSPACE_REPOSITORY_PORT,
      useExisting: RegistrationContentWorkspaceRepositoryAdapter,
    },
    {
      provide: PRODUCT_GENERATION_CHILD_LEDGER_REPOSITORY_PORT,
      useExisting: ProductGenerationChildLedgerRepositoryAdapter,
    },
    {
      provide: PRODUCT_GENERATION_CONTEXT_REPOSITORY_PORT,
      useExisting: ProductGenerationContextRepositoryAdapter,
    },
    {
      provide: SOURCING_WORKSPACE_ARCHIVE_REPOSITORY_PORT,
      useExisting: SourcingWorkspaceArchiveRepositoryAdapter,
    },
    {
      provide: THUMBNAIL_ANALYSIS_REPOSITORY_PORT,
      useExisting: ThumbnailAnalysisRepositoryAdapter,
    },
    {
      provide: THUMBNAIL_GENERATION_LEDGER_REPOSITORY_PORT,
      useExisting: ThumbnailGenerationLedgerRepositoryAdapter,
    },
    {
      provide: THUMBNAIL_TRACKING_REPOSITORY_PORT,
      useExisting: ThumbnailTrackingRepositoryAdapter,
    },
    {
      provide: THUMBNAIL_WING_REPOSITORY_PORT,
      useExisting: ThumbnailWingRepositoryAdapter,
    },
    { provide: TEXT_COMPLETION_PORT, useExisting: GeminiTextCompletionAdapter },
    { provide: THUMBNAIL_GENERATION_EVENT_PORT, useExisting: ThumbnailGenerationEventAdapter },
    { provide: AI_OPERATION_ALERT_PORT, useExisting: AiOperationAlertAdapter },
    {
      provide: CATALOG_MEDIA_PUBLICATION_PORT,
      useExisting: AiCatalogMediaPublicationRepositoryAdapter,
    },

    {
      provide: AI_WING_REGISTRATION_CAPABILITY_PORT,
      useExisting: AiWingRegistrationCapabilityAdapter,
    },
    { provide: PRODUCT_GENERATION_AI_TRIGGER_PORT, useExisting: ProductGenerationAiService },
    { provide: AI_WORKSPACE_ARCHIVE_PORT, useExisting: SourcingWorkspaceArchiveService },
    { provide: AI_GENERATION_CANCELLATION_PORT, useExisting: AiGenerationCancellationService },
    {
      provide: REGISTRATION_CONTENT_WORKSPACE_PORT,
      useExisting: RegistrationContentWorkspaceService,
    },
    { provide: CANDIDATE_CONTENT_ASSET_PORT, useExisting: ContentAssetService },
  ],
  exports: [
    PRODUCT_GENERATION_AI_TRIGGER_PORT,
    AI_WORKSPACE_ARCHIVE_PORT,
    AI_GENERATION_CANCELLATION_PORT,
    REGISTRATION_CONTENT_WORKSPACE_PORT,
    CANDIDATE_CONTENT_ASSET_PORT,
    CATALOG_MEDIA_PUBLICATION_PORT,
  ],
})
export class AiModule {}
