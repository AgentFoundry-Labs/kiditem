import { Controller, Get, Query } from '@nestjs/common';
import { ReviewsService } from '../services/reviews.service';
import { ListReviewsQueryDto } from '../dto';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  findAll(@Query() query: ListReviewsQueryDto) {
    return this.reviewsService.findAll(query as any);
  }
}
