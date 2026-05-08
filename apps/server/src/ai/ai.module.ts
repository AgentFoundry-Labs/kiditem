import { Module } from '@nestjs/common';
import { StorageService } from '../common/storage/storage.service';
import { ChannelsModule } from '../channels/channels.module';
import { AgentOsModule } from '../agent-os/agent-os.module';
import { AutomationModule } from '../automation/automation.module';

// adapter/in/http
import { ImageAiController } from './adapter/in/http/image-ai.controller';
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
import { ThumbnailGenerationSinkAdapter } from './adapter/out/agent-output/thumbnail-generation-sink.adapter';
import { DetailPageGenerateRuntimeHandler } from './adapter/out/agent-runtime/detail-page-generate.runtime-handler';
import { ThumbnailGenerateRuntimeHandler } from './adapter/out/agent-runtime/thumbnail-generate.runtime-handler';
import { CoupangInventoryScrapeAdapter } from './adapter/out/coupang/coupang-inventory-scrape.adapter';
import { CoupangProductSalesScrapeAdapter } from './adapter/out/coupang/coupang-product-sales-scrape.adapter';
import { CoupangImageReconciliationAdapter } from './adapter/out/channels/coupang-image-reconciliation.adapter';
import { GeminiTextCompletionAdapter } from './adapter/out/gemini/gemini-text-completion.adapter';
import { GeminiThumbnailVisionAdapter } from './adapter/out/gemini/gemini-thumbnail-vision.adapter';
import { ThumbnailReferenceImagesService } from './adapter/out/gemini/thumbnail-reference-images.adapter';
import { ThumbnailImageFetcherService } from './adapter/out/image-fetch/thumbnail-image-fetcher.adapter';
import { ThumbnailGenerationEventAdapter } from './adapter/out/prisma/thumbnail-generation-event.adapter';
import { ThumbnailWingPersistence } from './adapter/out/prisma/thumbnail-wing.persistence';
import { MasterCatalogAdapter } from './adapter/out/products/master-catalog.adapter';
import { WingAutomationRunner } from './adapter/out/wing/wing-automation-runner';

// application/service
import { DetailPageAgentOutputBridge } from './application/service/detail-page-agent-output.bridge';
import { DetailPageAgentReconcileService } from './application/service/detail-page-agent-reconcile.service';
import { ThumbnailAgentOutputBridge } from './application/service/thumbnail-agent-output.bridge';
import { ThumbnailAgentReconcileService } from './application/service/thumbnail-agent-reconcile.service';
import { ImageAiService } from './application/service/image-ai.service';
import { TextAiService } from './application/service/text-ai.service';
import { ThumbnailAnalysisService } from './application/service/thumbnail-analysis.service';
import { ThumbnailAutoService } from './application/service/thumbnail-auto.service';
import { CoupangImageSyncService } from './application/service/coupang-image-sync.service';
import { DetailPageHeroImageService } from './application/service/detail-page-hero-image.service';
import { DetailPageGeneratedImagesService } from './application/service/detail-page-generated-images.service';
import { DetailPageAiService } from './application/service/detail-page-ai.service';
import { DetailPageResultRefinerService } from './application/service/detail-page-result-refiner.service';
import { ThumbnailComplianceVerifierService } from './application/service/thumbnail-compliance-verifier.service';
import { ThumbnailEditorAiService } from './application/service/thumbnail-editor-ai.service';
import { ThumbnailGenerationService } from './application/service/thumbnail-generation.service';
import { ThumbnailRecomposeService } from './application/service/thumbnail-recompose.service';
import { ThumbnailTrackingService } from './application/service/thumbnail-tracking.service';
import { ThumbnailVisionAiService } from './application/service/thumbnail-vision-ai.service';
import { ThumbnailWingService } from './application/service/thumbnail-wing.service';

// application/port — out
import { DETAIL_PAGE_AGENT_OUTPUT_SINK_PORT } from './application/port/out/detail-page-agent-output-sink.port';
import { THUMBNAIL_AGENT_OUTPUT_SINK_PORT } from './application/port/out/thumbnail-agent-output-sink.port';
import { COUPANG_INVENTORY_SCRAPE_PORT } from './application/port/out/coupang-inventory-scrape.port';
import { COUPANG_PRODUCT_SALES_SCRAPE_PORT } from './application/port/out/coupang-product-sales-scrape.port';
import { COUPANG_IMAGE_RECONCILIATION_PORT } from './application/port/out/coupang-image-reconciliation.port';
import { IMAGE_FETCH_PORT } from './application/port/out/image-fetch.port';
import { IMAGE_STORAGE_PORT } from './application/port/out/image-storage.port';
import { MASTER_CATALOG_PORT } from './application/port/out/master-catalog.port';
import { TEXT_COMPLETION_PORT } from './application/port/out/text-completion.port';
import { THUMBNAIL_GENERATION_EVENT_PORT } from './application/port/out/thumbnail-generation-event.port';
import { WING_AUTOMATION_PORT } from './application/port/out/wing-automation.port';

@Module({
  imports: [ChannelsModule, AgentOsModule, AutomationModule],
  controllers: [
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
    DetailPageAgentReconcileService,
    DetailPageGeneratedImagesService,
    DetailPageHeroImageService,
    DetailPageResultRefinerService,
    TextAiService,
    ThumbnailAgentReconcileService,
    ThumbnailAnalysisService,
    ThumbnailAutoService,
    ThumbnailComplianceVerifierService,
    ThumbnailEditorAiService,
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
    ThumbnailAgentOutputBridge,

    // outgoing adapters
    DetailPageContentGenerationSinkAdapter,
    DetailPageGenerateRuntimeHandler,
    ThumbnailGenerationSinkAdapter,
    ThumbnailGenerateRuntimeHandler,
    CoupangImageReconciliationAdapter,
    CoupangInventoryScrapeAdapter,
    CoupangProductSalesScrapeAdapter,
    GeminiTextCompletionAdapter,
    GeminiThumbnailVisionAdapter,
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
    { provide: IMAGE_FETCH_PORT, useExisting: ThumbnailImageFetcherService },
    { provide: IMAGE_STORAGE_PORT, useExisting: StorageService },
    { provide: MASTER_CATALOG_PORT, useExisting: MasterCatalogAdapter },
    { provide: TEXT_COMPLETION_PORT, useExisting: GeminiTextCompletionAdapter },
    { provide: THUMBNAIL_GENERATION_EVENT_PORT, useExisting: ThumbnailGenerationEventAdapter },
  ],
})
export class AiModule {}
