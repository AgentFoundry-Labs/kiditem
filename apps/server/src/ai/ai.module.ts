import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { StorageService } from '../common/storage/storage.service';

// adapter/in/http
import { ImageAiController } from './adapter/in/http/image-ai.controller';
import { RenderImageController } from './adapter/in/http/render-image.controller';
import { TextAiController } from './adapter/in/http/text-ai.controller';
import { ThumbnailAnalysisController } from './adapter/in/http/thumbnail-analysis.controller';
import { ThumbnailAutoController } from './adapter/in/http/thumbnail-auto.controller';
import { ThumbnailEditorController } from './adapter/in/http/thumbnail-editor.controller';
import { ThumbnailTrackingController } from './adapter/in/http/thumbnail-tracking.controller';
import { CoupangImageSyncController } from './adapter/in/http/coupang-image-sync.controller';

// adapter/out
import { CoupangInventoryScrapeAdapter } from './adapter/out/coupang/coupang-inventory-scrape.adapter';
import { GeminiThumbnailVisionAdapter } from './adapter/out/gemini/gemini-thumbnail-vision.adapter';
import { ThumbnailReferenceImagesService } from './adapter/out/gemini/thumbnail-reference-images.adapter';
import { ThumbnailImageFetcherService } from './adapter/out/image-fetch/thumbnail-image-fetcher.adapter';
import { ThumbnailWingPersistence } from './adapter/out/prisma/thumbnail-wing.persistence';
import { MasterCatalogAdapter } from './adapter/out/products/master-catalog.adapter';
import { WingAutomationRunner } from './adapter/out/wing/wing-automation-runner';

// application/service
import { ImageAiService } from './application/service/image-ai.service';
import { TextAiService } from './application/service/text-ai.service';
import { ThumbnailAnalysisService } from './application/service/thumbnail-analysis.service';
import { ThumbnailAutoService } from './application/service/thumbnail-auto.service';
import { CoupangImageSyncService } from './application/service/coupang-image-sync.service';
import { ThumbnailComplianceVerifierService } from './application/service/thumbnail-compliance-verifier.service';
import { ThumbnailEditorAiService } from './application/service/thumbnail-editor-ai.service';
import { ThumbnailGenerationService } from './application/service/thumbnail-generation.service';
import { ThumbnailRecomposeService } from './application/service/thumbnail-recompose.service';
import { ThumbnailTrackingService } from './application/service/thumbnail-tracking.service';
import { ThumbnailVisionAiService } from './application/service/thumbnail-vision-ai.service';
import { ThumbnailWingService } from './application/service/thumbnail-wing.service';

// application/port — out
import { COUPANG_INVENTORY_SCRAPE_PORT } from './application/port/out/coupang-inventory-scrape.port';
import { IMAGE_FETCH_PORT } from './application/port/out/image-fetch.port';
import { IMAGE_STORAGE_PORT } from './application/port/out/image-storage.port';
import { MASTER_CATALOG_PORT } from './application/port/out/master-catalog.port';
import { WING_AUTOMATION_PORT } from './application/port/out/wing-automation.port';

@Module({
  imports: [ProductsModule],
  controllers: [
    CoupangImageSyncController,
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
    TextAiService,
    ThumbnailAnalysisService,
    ThumbnailAutoService,
    ThumbnailComplianceVerifierService,
    ThumbnailEditorAiService,
    ThumbnailGenerationService,
    ThumbnailRecomposeService,
    ThumbnailTrackingService,
    ThumbnailVisionAiService,
    ThumbnailWingService,

    // outgoing adapters
    CoupangInventoryScrapeAdapter,
    GeminiThumbnailVisionAdapter,
    MasterCatalogAdapter,
    ThumbnailImageFetcherService,
    ThumbnailReferenceImagesService,
    ThumbnailWingPersistence,
    WingAutomationRunner,

    // port bindings
    { provide: WING_AUTOMATION_PORT, useExisting: WingAutomationRunner },
    { provide: COUPANG_INVENTORY_SCRAPE_PORT, useExisting: CoupangInventoryScrapeAdapter },
    { provide: IMAGE_FETCH_PORT, useExisting: ThumbnailImageFetcherService },
    { provide: IMAGE_STORAGE_PORT, useExisting: StorageService },
    { provide: MASTER_CATALOG_PORT, useExisting: MasterCatalogAdapter },
  ],
})
export class AiModule {}
