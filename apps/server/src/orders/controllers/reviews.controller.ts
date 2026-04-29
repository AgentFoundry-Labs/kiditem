// apps/server/src/orders/controllers/reviews.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import {
  ReviewListResponseSchema,
  type ReviewListResponse,
} from '@kiditem/shared/reviews';
import { ReviewsService } from '../services/reviews.service';
import { ListReviewsQueryDto } from '../dto/list-reviews.dto';

// NOTE: no `@UseGuards`/`@UsePipes` — global APP_GUARD (CompanyScopeGuard)
// + global ValidationPipe handle that. See apps/server/AGENTS.md.
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly svc: ReviewsService) {}

  @Get()
  async list(
    @CurrentCompany() companyId: string,
    @Query() query: ListReviewsQueryDto,
  ): Promise<ReviewListResponse> {
    const response = await this.svc.list(companyId, query);
    return ReviewListResponseSchema.parse(response);
  }
}
