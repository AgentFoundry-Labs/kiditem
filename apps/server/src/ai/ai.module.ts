import { Module } from '@nestjs/common';
import { TextAiController } from './controllers/text-ai.controller';
import { TextAiService } from './services/text-ai.service';
import { ImageAiController } from './controllers/image-ai.controller';
import { ImageAiService } from './services/image-ai.service';
import { RenderImageController } from './controllers/render-image.controller';
import { ThumbnailAnalysisController } from './controllers/thumbnail-analysis.controller';
import { ThumbnailAutoController } from './controllers/thumbnail-auto.controller';
import { ThumbnailEditorController } from './controllers/thumbnail-editor.controller';
import { ThumbnailTrackingController } from './controllers/thumbnail-tracking.controller';
import { ThumbnailAnalysisService } from './services/thumbnail-analysis.service';
import { ThumbnailAutoService } from './services/thumbnail-auto.service';
import { ThumbnailEditorAiService } from './services/thumbnail-editor-ai.service';
import { ThumbnailGenerationService } from './services/thumbnail-generation.service';
import { ThumbnailImageFetcherService } from './services/thumbnail-image-fetcher.service';
import { ThumbnailRecomposeService } from './services/thumbnail-recompose.service';
import { ThumbnailReferenceImagesService } from './services/thumbnail-reference-images.service';
import { ThumbnailTrackingService } from './services/thumbnail-tracking.service';
import { ThumbnailVisionAiService } from './services/thumbnail-vision-ai.service';
import { ThumbnailWingService } from './services/thumbnail-wing.service';
import { ThumbnailWingPersistence } from './persistence/thumbnail-wing.persistence';
import { WingAutomationRunner } from './adapters/wing-automation-runner';
import { GeminiThumbnailVisionAdapter } from './adapters/gemini-thumbnail-vision.adapter';
import { ThumbnailComplianceVerifierService } from './services/thumbnail-compliance-verifier.service';

@Module({
  controllers: [
    TextAiController,
    ImageAiController,
    RenderImageController,
    ThumbnailAnalysisController,
    ThumbnailAutoController,
    ThumbnailEditorController,
    ThumbnailTrackingController,
  ],
  providers: [
    TextAiService,
    ImageAiService,
    ThumbnailAnalysisService,
    ThumbnailAutoService,
    ThumbnailEditorAiService,
    ThumbnailGenerationService,
    ThumbnailImageFetcherService,
    ThumbnailRecomposeService,
    ThumbnailReferenceImagesService,
    ThumbnailTrackingService,
    ThumbnailVisionAiService,
    ThumbnailWingService,
    ThumbnailWingPersistence,
    WingAutomationRunner,
    GeminiThumbnailVisionAdapter,
    ThumbnailComplianceVerifierService,
  ],
})
export class AiModule {}
