import { Module } from '@nestjs/common';
import { ProductsController } from './controllers/products.controller';
import { ProductsService } from './services/products.service';
import { ThumbnailsController } from './controllers/thumbnails.controller';
import { ThumbnailsService } from './services/thumbnails.service';
import { ReviewsController } from './controllers/reviews.controller';
import { ReviewsService } from './services/reviews.service';

@Module({
  controllers: [
    ProductsController,
    ThumbnailsController,
    ReviewsController,
  ],
  providers: [
    ProductsService,
    ThumbnailsService,
    ReviewsService,
  ],
})
export class ProductsModule {}
