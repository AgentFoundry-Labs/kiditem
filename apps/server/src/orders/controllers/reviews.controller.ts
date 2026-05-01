// apps/server/src/orders/controllers/reviews.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import {
  ReviewListResponseSchema,
  type ReviewListResponse,
} from '@kiditem/shared/reviews';
import { ReviewsService } from '../services/reviews.service';
import { ListReviewsQueryDto } from '../dto/list-reviews.dto';

// NOTE: no `@UseGuards`/`@UsePipes` — global APP_GUARD (OrganizationScopeGuard)
// + global ValidationPipe handle that. See apps/server/AGENTS.md.
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly svc: ReviewsService) {}

  @Get()
  async list(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListReviewsQueryDto,
  ): Promise<ReviewListResponse> {
    const response = await this.svc.list(organizationId, query);
    return ReviewListResponseSchema.parse(response);
  }
}
