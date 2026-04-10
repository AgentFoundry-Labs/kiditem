import { Module } from '@nestjs/common';
import { ProductsController } from './controllers/products.controller';
import { ProductsService } from './services/products.service';
import { ThumbnailsController } from './controllers/thumbnails.controller';
import { ThumbnailsService } from './services/thumbnails.service';
import { ReviewsController } from './controllers/reviews.controller';
import { ReviewsService } from './services/reviews.service';
import { ThumbnailAnalysisController } from './controllers/thumbnail-analysis.controller';
import { ThumbnailAiService } from './services/thumbnail-ai.service';
import { ThumbnailAnalysisService } from './services/thumbnail-analysis.service';
import { ThumbnailGenerationService } from './services/thumbnail-generation.service';
import { ThumbnailEditService } from './services/thumbnail-edit.service';

@Module({
  controllers: [
    ProductsController,
    ThumbnailsController,
    ReviewsController,
    ThumbnailAnalysisController,
  ],
  providers: [
    ProductsService,
    ThumbnailsService,
    ReviewsService,
    ThumbnailAiService,
    ThumbnailAnalysisService,
    ThumbnailGenerationService,
    ThumbnailEditService,
  ],
})
export class ProductsModule {}
