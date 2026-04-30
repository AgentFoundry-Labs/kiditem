import { Module } from '@nestjs/common';

// adapter/in/http
import { ImageAiController } from './adapter/in/http/image-ai.controller';
import { RenderImageController } from './adapter/in/http/render-image.controller';
import { TextAiController } from './adapter/in/http/text-ai.controller';
import { ThumbnailAnalysisController } from './adapter/in/http/thumbnail-analysis.controller';
import { ThumbnailAutoController } from './adapter/in/http/thumbnail-auto.controller';
import { ThumbnailEditorController } from './adapter/in/http/thumbnail-editor.controller';
import { ThumbnailTrackingController } from './adapter/in/http/thumbnail-tracking.controller';

// adapter/out
import { GeminiThumbnailVisionAdapter } from './adapter/out/gemini/gemini-thumbnail-vision.adapter';
import { ThumbnailReferenceImagesService } from './adapter/out/gemini/thumbnail-reference-images.adapter';
import { ThumbnailImageFetcherService } from './adapter/out/image-fetch/thumbnail-image-fetcher.adapter';
import { ThumbnailWingPersistence } from './adapter/out/prisma/thumbnail-wing.persistence';
import { WingAutomationRunner } from './adapter/out/wing/wing-automation-runner';

// application/service
import { ImageAiService } from './application/service/image-ai.service';
import { TextAiService } from './application/service/text-ai.service';
import { ThumbnailAnalysisService } from './application/service/thumbnail-analysis.service';
import { ThumbnailAutoService } from './application/service/thumbnail-auto.service';
import { ThumbnailComplianceVerifierService } from './application/service/thumbnail-compliance-verifier.service';
import { ThumbnailEditorAiService } from './application/service/thumbnail-editor-ai.service';
import { ThumbnailGenerationService } from './application/service/thumbnail-generation.service';
import { ThumbnailRecomposeService } from './application/service/thumbnail-recompose.service';
import { ThumbnailTrackingService } from './application/service/thumbnail-tracking.service';
import { ThumbnailVisionAiService } from './application/service/thumbnail-vision-ai.service';
import { ThumbnailWingService } from './application/service/thumbnail-wing.service';

// application/port — out
import { WING_AUTOMATION_PORT } from './application/port/out/wing-automation.port';

@Module({
  controllers: [
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
    GeminiThumbnailVisionAdapter,
    ThumbnailImageFetcherService,
    ThumbnailReferenceImagesService,
    ThumbnailWingPersistence,
    WingAutomationRunner,

    // port bindings — Wing automation port → Playwriter runner adapter
    {
      provide: WING_AUTOMATION_PORT,
      useExisting: WingAutomationRunner,
    },
  ],
})
export class AiModule {}
