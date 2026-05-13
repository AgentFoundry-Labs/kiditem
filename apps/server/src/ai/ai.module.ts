import { Module } from '@nestjs/common';
import { StorageService } from '../common/storage/storage.service';
import { ChannelsModule } from '../channels/channels.module';
import { AgentOsModule } from '../agent-os/agent-os.module';
import { AutomationModule } from '../automation/automation.module';

// adapter/in/http
import { ImageAiController } from './adapter/in/http/image-ai.controller';
import { ContentArchiveController } from './adapter/in/http/content-archive.controller';
import { ContentArchiveLinkageController } from './adapter/in/http/content-archive-linkage.controller';
import { ContentAssetController } from './adapter/in/http/content-asset.controller';
import { ContentGenerationRerunController } from './adapter/in/http/content-generation-rerun.controller';
import { ContentWorkspaceAttachmentController } from './adapter/in/http/content-workspace-attachment.controller';
import { DetailPageAiController } from './adapter/in/http/detail-page-ai.controller';
import { RenderImageController } from './adapter/in/http/render-image.controller';
import { TextAiController } from './adapter/in/http/text-ai.controller';
import { ThumbnailAnalysisController } from './adapter/in/http/thumbnail-analysis.controller';
import { ThumbnailAutoController } from './adapter/in/http/thumbnail-auto.controller';
import { ThumbnailEditorController } from './adapter/in/http/thumbnail-editor.controller';
import { ThumbnailTrackingController } from './adapter/in/http/thumbnail-tracking.controller';
import { CoupangImageSyncController } from './adapter/in/http/coupang-image-sync.controller';

// adapter/out
import { DetailPageContentGenerationSinkAdapter } from './adapter/out/agent-output/detail-page-content-generation-sink.adapter';
import { ImageEditContentGenerationSinkAdapter } from './adapter/out/agent-output/image-edit-content-generation-sink.adapter';
import { ThumbnailGenerationSinkAdapter } from './adapter/out/agent-output/thumbnail-generation-sink.adapter';
import { DetailPageGenerateRuntimeHandler } from './adapter/out/agent-runtime/detail-page-generate.runtime-handler';
import { ImageEditRuntimeHandler } from './adapter/out/agent-runtime/image-edit.runtime-handler';
import { ThumbnailGenerateRuntimeHandler } from './adapter/out/agent-runtime/thumbnail-generate.runtime-handler';
import { CoupangInventoryScrapeAdapter } from './adapter/out/coupang/coupang-inventory-scrape.adapter';
import { CoupangProductSalesScrapeAdapter } from './adapter/out/coupang/coupang-product-sales-scrape.adapter';
import { CoupangImageReconciliationAdapter } from './adapter/out/channels/coupang-image-reconciliation.adapter';
import { DetailPageGeminiMediaAdapter } from './adapter/out/gemini/detail-page-gemini-media.adapter';
import { GeminiTextCompletionAdapter } from './adapter/out/gemini/gemini-text-completion.adapter';
import { GeminiThumbnailVisionAdapter } from './adapter/out/gemini/gemini-thumbnail-vision.adapter';
import { ImageEditGeminiMediaAdapter } from './adapter/out/gemini/image-edit-gemini-media.adapter';
import { ThumbnailReferenceImagesService } from './adapter/out/gemini/thumbnail-reference-images.adapter';
import { ThumbnailImageFetcherService } from './adapter/out/image-fetch/thumbnail-image-fetcher.adapter';
import { ThumbnailGenerationEventAdapter } from './adapter/out/prisma/thumbnail-generation-event.adapter';
import { ThumbnailWingPersistence } from './adapter/out/prisma/thumbnail-wing.persistence';
import { MasterCatalogAdapter } from './adapter/out/products/master-catalog.adapter';
import { WingAutomationRunner } from './adapter/out/wing/wing-automation-runner';

// application/service
import { DetailPageAgentOutputBridge } from './application/service/detail-page-agent-output.bridge';
import { DetailPageAgentReconcileService } from './application/service/detail-page-agent-reconcile.service';
import { ImageEditAgentOutputBridge } from './application/service/image-edit-agent-output.bridge';
import { ThumbnailAgentOutputBridge } from './application/service/thumbnail-agent-output.bridge';
import { ThumbnailAgentReconcileService } from './application/service/thumbnail-agent-reconcile.service';
import { ImageAiService } from './application/service/image-ai.service';
import { TextAiService } from './application/service/text-ai.service';
import { ThumbnailAnalysisService } from './application/service/thumbnail-analysis.service';
import { ThumbnailAnalysisAnalyzerService } from './application/service/thumbnail-analysis-analyzer.service';
import { ThumbnailAnalysisBatchService } from './application/service/thumbnail-analysis-batch.service';
import { ThumbnailAnalysisQueryService } from './application/service/thumbnail-analysis-query.service';
import { ThumbnailAutoService } from './application/service/thumbnail-auto.service';
import { CoupangImageSyncService } from './application/service/coupang-image-sync.service';
import { DetailPageHeroImageService } from './application/service/detail-page-hero-image.service';
import { DetailPageGeneratedImagesService } from './application/service/detail-page-generated-images.service';
import { ContentAssetService } from './application/service/content-asset.service';
import { DetailPageAiService } from './application/service/detail-page-ai.service';
import { DetailPageGenerationService } from './application/service/detail-page-generation.service';
import { DetailPagePrefillService } from './application/service/detail-page-prefill.service';
import { DetailPageQueryService } from './application/service/detail-page-query.service';
import { DetailPageResultRefinerService } from './application/service/detail-page-result-refiner.service';
import { PostPromotionAiService } from './application/service/post-promotion-ai.service';
import { BoldVerticalRefinerService } from './application/service/bold-vertical-refiner.service';
import { KidsPlayfulRefinerService } from './application/service/kids-playful-refiner.service';
import { ThumbnailComplianceVerifierService } from './application/service/thumbnail-compliance-verifier.service';
import { ThumbnailEditorAiService } from './application/service/thumbnail-editor-ai.service';
import { ThumbnailGenerationJobService } from './application/service/thumbnail-generation-job.service';
import { ThumbnailGenerationService } from './application/service/thumbnail-generation.service';
import { ThumbnailRecomposeService } from './application/service/thumbnail-recompose.service';
import { ThumbnailTrackingService } from './application/service/thumbnail-tracking.service';
import { ThumbnailVisionAiService } from './application/service/thumbnail-vision-ai.service';
import { ThumbnailWingService } from './application/service/thumbnail-wing.service';
import { ContentArchiveService } from './application/service/content-archive.service';
import { ContentGenerationRerunService } from './application/service/content-generation-rerun.service';
import { ContentWorkspaceAttachmentService } from './application/service/content-workspace-attachment.service';

// application/port — in
import { POST_PROMOTION_AI_TRIGGER_PORT } from './application/port/in/post-promotion-ai-trigger.port';

// application/port — out
import { DETAIL_PAGE_AGENT_OUTPUT_SINK_PORT } from './application/port/out/detail-page-agent-output-sink.port';
import { DETAIL_PAGE_MEDIA_PORT } from './application/port/out/detail-page-media.port';
import { IMAGE_EDIT_AGENT_OUTPUT_SINK_PORT } from './application/port/out/image-edit-agent-output-sink.port';
import { THUMBNAIL_AGENT_OUTPUT_SINK_PORT } from './application/port/out/thumbnail-agent-output-sink.port';
import { COUPANG_INVENTORY_SCRAPE_PORT } from './application/port/out/coupang-inventory-scrape.port';
import { COUPANG_PRODUCT_SALES_SCRAPE_PORT } from './application/port/out/coupang-product-sales-scrape.port';
import { COUPANG_IMAGE_RECONCILIATION_PORT } from './application/port/out/coupang-image-reconciliation.port';
import { IMAGE_EDIT_MEDIA_PORT } from './application/port/out/image-edit-media.port';
import { IMAGE_FETCH_PORT } from './application/port/out/image-fetch.port';
import { IMAGE_STORAGE_PORT } from './application/port/out/image-storage.port';
import { MASTER_CATALOG_PORT } from './application/port/out/master-catalog.port';
import { TEXT_COMPLETION_PORT } from './application/port/out/text-completion.port';
import { THUMBNAIL_GENERATION_EVENT_PORT } from './application/port/out/thumbnail-generation-event.port';
import { WING_AUTOMATION_PORT } from './application/port/out/wing-automation.port';

@Module({
  imports: [ChannelsModule, AgentOsModule, AutomationModule],
  controllers: [
    ContentArchiveController,
    ContentArchiveLinkageController,
    ContentAssetController,
    ContentGenerationRerunController,
    ContentWorkspaceAttachmentController,
    CoupangImageSyncController,
    DetailPageAiController,
    ImageAiController,
    RenderImageController,
    TextAiController,
    ThumbnailAnalysisController,
    ThumbnailAutoController,
    ThumbnailEditorController,
    ThumbnailTrackingController,
  ],
  providers: [
    // application services
    ImageAiService,
    CoupangImageSyncService,
    DetailPageAiService,
    DetailPageGenerationService,
    DetailPageAgentReconcileService,
    ContentArchiveService,
    ContentAssetService,
    ContentGenerationRerunService,
    ContentWorkspaceAttachmentService,
    DetailPageGeneratedImagesService,
    DetailPageHeroImageService,
    DetailPagePrefillService,
    DetailPageQueryService,
    DetailPageResultRefinerService,
    BoldVerticalRefinerService,
    KidsPlayfulRefinerService,
    PostPromotionAiService,
    TextAiService,
    ThumbnailAgentReconcileService,
    ThumbnailAnalysisService,
    ThumbnailAnalysisAnalyzerService,
    ThumbnailAnalysisBatchService,
    ThumbnailAnalysisQueryService,
    ThumbnailAutoService,
    ThumbnailComplianceVerifierService,
    ThumbnailEditorAiService,
    ThumbnailGenerationJobService,
    ThumbnailGenerationService,
    ThumbnailRecomposeService,
    ThumbnailTrackingService,
    ThumbnailVisionAiService,
    ThumbnailWingService,

    // Agent OS bridges — listen for finalized events and route validated
    // output through the sink ports defined below. Detail-page + thumbnail
    // both write back to their owner row (`ContentGeneration` /
    // `ThumbnailGeneration`).
    DetailPageAgentOutputBridge,
    ImageEditAgentOutputBridge,
    ThumbnailAgentOutputBridge,

    // outgoing adapters
    DetailPageContentGenerationSinkAdapter,
    DetailPageGeminiMediaAdapter,
    DetailPageGenerateRuntimeHandler,
    ImageEditContentGenerationSinkAdapter,
    ImageEditRuntimeHandler,
    ThumbnailGenerationSinkAdapter,
    ThumbnailGenerateRuntimeHandler,
    CoupangImageReconciliationAdapter,
    CoupangInventoryScrapeAdapter,
    CoupangProductSalesScrapeAdapter,
    GeminiTextCompletionAdapter,
    GeminiThumbnailVisionAdapter,
    ImageEditGeminiMediaAdapter,
    MasterCatalogAdapter,
    ThumbnailGenerationEventAdapter,
    ThumbnailImageFetcherService,
    ThumbnailReferenceImagesService,
    ThumbnailWingPersistence,
    WingAutomationRunner,

    // port bindings
    { provide: WING_AUTOMATION_PORT, useExisting: WingAutomationRunner },
    { provide: COUPANG_IMAGE_RECONCILIATION_PORT, useExisting: CoupangImageReconciliationAdapter },
    { provide: COUPANG_INVENTORY_SCRAPE_PORT, useExisting: CoupangInventoryScrapeAdapter },
    { provide: COUPANG_PRODUCT_SALES_SCRAPE_PORT, useExisting: CoupangProductSalesScrapeAdapter },
    {
      // Real sink — applies validated detail_page_generate output to the
      // originating ContentGeneration row (READY/FAILED + processedImages
      // + operation alert close). Phase 2 follow-up replaces this binding
      // for additional AI agent types as they ship.
      provide: DETAIL_PAGE_AGENT_OUTPUT_SINK_PORT,
      useExisting: DetailPageContentGenerationSinkAdapter,
    },
    {
      // Real sink — applies validated thumbnail_generate output to the
      // originating ThumbnailGeneration row (succeeded/failed + candidates
      // + status events + operation alert close). Mirrors the detail-page
      // wiring shipped in PR #213.
      provide: THUMBNAIL_AGENT_OUTPUT_SINK_PORT,
      useExisting: ThumbnailGenerationSinkAdapter,
    },
    {
      provide: IMAGE_EDIT_AGENT_OUTPUT_SINK_PORT,
      useExisting: ImageEditContentGenerationSinkAdapter,
    },
    { provide: IMAGE_FETCH_PORT, useExisting: ThumbnailImageFetcherService },
    { provide: IMAGE_EDIT_MEDIA_PORT, useExisting: ImageEditGeminiMediaAdapter },
    { provide: IMAGE_STORAGE_PORT, useExisting: StorageService },
    { provide: DETAIL_PAGE_MEDIA_PORT, useExisting: DetailPageGeminiMediaAdapter },
    { provide: MASTER_CATALOG_PORT, useExisting: MasterCatalogAdapter },
    { provide: TEXT_COMPLETION_PORT, useExisting: GeminiTextCompletionAdapter },
    { provide: THUMBNAIL_GENERATION_EVENT_PORT, useExisting: ThumbnailGenerationEventAdapter },

    // Inbound port — sourcing's post-promotion gateway injects this to fire
    // detail-page + thumbnail generation with AI-domain-owned defaults.
    { provide: POST_PROMOTION_AI_TRIGGER_PORT, useExisting: PostPromotionAiService },
  ],
  exports: [POST_PROMOTION_AI_TRIGGER_PORT],
})
export class AiModule {}
