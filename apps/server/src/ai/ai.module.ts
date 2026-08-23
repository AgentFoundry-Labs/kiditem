import { Module } from '@nestjs/common';
import { StorageService } from '../common/storage/storage.service';
import { StorageModule } from '../common/storage/storage.module';
import { AgentOsCapabilityModule } from '../agent-os/agent-os-capability.module';
import { AgentOsSessionModule } from '../agent-os/agent-os-session.module';
import { OperationAlertRuntimeModule } from '../automation/operation-alert-runtime.module';
import { PrismaModule } from '../prisma/prisma.module';
// adapter/in/http
import { CATALOG_MEDIA_PUBLICATION_PORT } from '../channels/application/port/out/cross-domain/catalog-media-publication.port';
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
import { ContentWorkspaceThumbnailSelectionRepositoryAdapter } from './adapter/out/repository/content-workspace-thumbnail-selection.repository.adapter';
import { RegistrationContentWorkspaceRepositoryAdapter } from './adapter/out/repository/registration-content-workspace.repository.adapter';
import { DetailPageGenerationRepositoryAdapter } from './adapter/out/repository/detail-page-generation.repository.adapter';
import { DetailPageQueryRepositoryAdapter } from './adapter/out/repository/detail-page-query.repository.adapter';
import { DetailPageImageRepositoryAdapter } from './adapter/out/repository/detail-page-image.repository.adapter';
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
import { DetailPageClientRenderService } from './application/service/detail-page-client-render.service';
import { DetailPageRasterizationService } from './application/service/detail-page-rasterization.service';
import { DetailPagePrefillService } from './application/service/detail-page-prefill.service';
import { DetailPageQueryService } from './application/service/detail-page-query.service';
import { DetailPageResultRefinerService } from './application/service/detail-page-result-refiner.service';
import { ImageAssetOperationService } from './application/service/image-asset-operation.service';
import { ProductGenerationAiService } from './application/service/product-generation-ai.service';
import { PrismaProductGenerationIdempotencyAdapter } from './adapter/out/transaction/prisma-product-generation-idempotency.adapter';
import { PRODUCT_GENERATION_IDEMPOTENCY_PORT } from './application/port/out/transaction/product-generation-idempotency.port';
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
import { AiDirectJobInputAssetsService } from './application/service/ai-direct-job-input-assets.service';
import { AiDirectJobPayloadHydratorService } from './application/service/ai-direct-job-payload-hydrator.service';
import { AiDirectJobProcessorService } from './application/service/ai-direct-job-processor.service';
import { AiDirectJobWorkerService } from './application/service/ai-direct-job-worker.service';
import { AiDirectJobWakeRegistrationService } from './application/service/ai-direct-job-wake-registration.service';
import { CatalogDisplayMediaService } from './application/service/catalog-display-media.service';
import {
  AI_DIRECT_JOB_RUNTIME_CONFIG,
  resolveAiDirectJobRuntimeConfig,
} from './application/service/ai-direct-job.config';
// application/port — in
import { AI_WING_REGISTRATION_CAPABILITY_PORT } from './application/port/in/capability/wing-registration.port';
import {
  AI_GENERATION_CANCELLATION_PORT,
  PRODUCT_GENERATION_AI_TRIGGER_PORT,
} from './application/port/in/generation';
import {
  AI_WORKSPACE_ARCHIVE_PORT,
  CANDIDATE_CONTENT_ASSET_PORT,
  CATALOG_DISPLAY_MEDIA_PORT,
  REGISTRATION_CONTENT_WORKSPACE_PORT,
} from './application/port/in/workspace';
// application/port — out
import { AI_OPERATION_ALERT_PORT } from './application/port/out/cross-domain';
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
  CONTENT_WORKSPACE_THUMBNAIL_SELECTION_REPOSITORY_PORT,
  DETAIL_PAGE_GENERATION_REPOSITORY_PORT,
  DETAIL_PAGE_IMAGE_REPOSITORY_PORT,
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
  AI_DIRECT_JOB_WAKE_PORT,
  DETAIL_PAGE_TEMPLATE_STYLES_PORT,
  WING_AUTOMATION_PORT,
} from './application/port/out/runtime';
import {
  DETAIL_PAGE_DIRECT_OUTPUT_SINK_PORT,
  THUMBNAIL_DIRECT_OUTPUT_SINK_PORT,
} from './application/port/out/sink';
import { IMAGE_STORAGE_PORT } from './application/port/out/storage';
import { AiProductGenerationRuntimeModule } from './ai-product-generation-runtime.module';

@Module({
  imports: [
    PrismaModule,
    OperationAlertRuntimeModule,
    AgentOsSessionModule,
    AgentOsCapabilityModule,
    StorageModule,
    AiProductGenerationRuntimeModule,
  ],
  providers: [
    DetailPageHeroImageService,
    DetailPageResultRefinerService,
    BoldVerticalRefinerService,
    KidsPlayfulRefinerService,
    ThumbnailWingService,
    AiWingRegistrationCapabilityAdapter,
    DetailPageGeminiMediaAdapter,
    ThumbnailWingRepositoryAdapter,
    WingAutomationRunner,
    { provide: WING_AUTOMATION_PORT, useExisting: WingAutomationRunner },
    { provide: DETAIL_PAGE_MEDIA_PORT, useExisting: DetailPageGeminiMediaAdapter },
    {
      provide: THUMBNAIL_WING_REPOSITORY_PORT,
      useExisting: ThumbnailWingRepositoryAdapter,
    },
    {
      provide: AI_WING_REGISTRATION_CAPABILITY_PORT,
      useExisting: AiWingRegistrationCapabilityAdapter,
    },
  ],
  exports: [
    AiProductGenerationRuntimeModule,
    ThumbnailWingService,
    DETAIL_PAGE_MEDIA_PORT,
    THUMBNAIL_WING_REPOSITORY_PORT,
    WING_AUTOMATION_PORT,
    AI_WING_REGISTRATION_CAPABILITY_PORT,
  ],
})
export class AiAgentRuntimeModule {}

@Module({
  imports: [AiAgentRuntimeModule],
  providers: [
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
    ContentWorkspaceThumbnailSelectionService,
    RegistrationContentWorkspaceService,
    SourcingWorkspaceArchiveService,
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
    ContentWorkspaceThumbnailSelectionRepositoryAdapter,
    RegistrationContentWorkspaceRepositoryAdapter,
    DetailPageImageRepositoryAdapter,
    SourcingWorkspaceArchiveRepositoryAdapter,
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
      provide: CONTENT_WORKSPACE_THUMBNAIL_SELECTION_REPOSITORY_PORT,
      useExisting: ContentWorkspaceThumbnailSelectionRepositoryAdapter,
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
      provide: SOURCING_WORKSPACE_ARCHIVE_REPOSITORY_PORT,
      useExisting: SourcingWorkspaceArchiveRepositoryAdapter,
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
      useExisting: SourcingWorkspaceArchiveService,
    },
    {
      provide: AI_GENERATION_CANCELLATION_PORT,
      useExisting: AiGenerationCancellationService,
    },
    {
      provide: REGISTRATION_CONTENT_WORKSPACE_PORT,
      useExisting: RegistrationContentWorkspaceService,
    },
    { provide: CANDIDATE_CONTENT_ASSET_PORT, useExisting: ContentAssetService },
    { provide: CATALOG_DISPLAY_MEDIA_PORT, useExisting: CatalogDisplayMediaService },
  ],
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
  exports: [
    AiAgentRuntimeModule,
    ContentArchiveService,
    ContentAssetService,
    ContentGenerationRerunService,
    ContentWorkspaceThumbnailSelectionService,
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
    CANDIDATE_CONTENT_ASSET_PORT,
    CATALOG_MEDIA_PUBLICATION_PORT,
    CATALOG_DISPLAY_MEDIA_PORT,
  ],
})
export class AiModule {}
