import { Module } from '@nestjs/common';
import { ProductsController } from './controllers/products.controller';
import { ProductsService } from './services/products.service';
import { ThumbnailsController } from './controllers/thumbnails.controller';
import { ThumbnailsService } from './services/thumbnails.service';
import { ReviewsController } from './controllers/reviews.controller';
import { ReviewsService } from './services/reviews.service';
import { ThumbnailAnalysisController } from './controllers/thumbnail-analysis.controller';
import { ThumbnailEditorController } from './controllers/thumbnail-editor.controller';
import { ThumbnailTrackingController } from './controllers/thumbnail-tracking.controller';
import { ThumbnailAiService } from './services/thumbnail-ai.service';
import { ThumbnailAnalysisService } from './services/thumbnail-analysis.service';
import { ThumbnailGenerationService } from './services/thumbnail-generation.service';
import { ThumbnailEditService } from './services/thumbnail-edit.service';
import { ThumbnailTrackingService } from './services/thumbnail-tracking.service';
import { ThumbnailWingService } from './services/thumbnail-wing.service';

@Module({
  controllers: [
    ProductsController,
    ThumbnailsController,
    ReviewsController,
    ThumbnailAnalysisController,
    ThumbnailEditorController,
    ThumbnailTrackingController,
  ],
  providers: [
    ProductsService,
    ThumbnailsService,
    ReviewsService,
    ThumbnailAiService,
    ThumbnailAnalysisService,
    ThumbnailGenerationService,
    ThumbnailEditService,
    ThumbnailTrackingService,
    ThumbnailWingService,
  ],
})
export class ProductsModule {}
