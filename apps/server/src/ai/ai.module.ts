import { Module } from '@nestjs/common';
import { TextAiController } from './controllers/text-ai.controller';
import { TextAiService } from './services/text-ai.service';
import { ImageAiController } from './controllers/image-ai.controller';
import { ImageAiService } from './services/image-ai.service';
import { RenderImageController } from './controllers/render-image.controller';
import { ThumbnailAnalysisController } from './controllers/thumbnail-analysis.controller';
import { ThumbnailTrackingController } from './controllers/thumbnail-tracking.controller';
import { ThumbnailAnalysisService } from './services/thumbnail-analysis.service';
import { ThumbnailGenerationService } from './services/thumbnail-generation.service';
import { ThumbnailTrackingService } from './services/thumbnail-tracking.service';

@Module({
  controllers: [
    TextAiController,
    ImageAiController,
    RenderImageController,
    ThumbnailAnalysisController,
    ThumbnailTrackingController,
  ],
  providers: [
    TextAiService,
    ImageAiService,
    ThumbnailAnalysisService,
    ThumbnailGenerationService,
    ThumbnailTrackingService,
  ],
})
export class AiModule {}
