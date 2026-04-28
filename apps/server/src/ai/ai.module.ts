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
import { ThumbnailEditorAiService } from './services/thumbnail-editor-ai.service';
import { ThumbnailGenerationService } from './services/thumbnail-generation.service';
import { ThumbnailTrackingService } from './services/thumbnail-tracking.service';

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
    ThumbnailEditorAiService,
    ThumbnailGenerationService,
    ThumbnailTrackingService,
  ],
})
export class AiModule {}
