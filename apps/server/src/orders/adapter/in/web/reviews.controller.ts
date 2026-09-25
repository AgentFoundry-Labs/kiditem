import { Controller, Get, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ListReviewItemsQueryDto } from './dto/list-review-items.dto';
import { ListReviewsQueryDto } from './dto/list-reviews.dto';
import { ReviewsService } from '../../../application/service/reviews.service';

// NOTE: no `@UseGuards`/`@UsePipes` — global APP_GUARD (OrganizationScopeGuard)
// + global ValidationPipe handle the read DTOs. 수집은 실행 kind `orders.coupang_reviews`
// (`/api/operations`)가 맡는다(KID-359).
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly svc: ReviewsService) {}

  @Get()
  async list(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListReviewsQueryDto,
  ) {
    return this.svc.list(organizationId, query);
  }

  @Get('items')
  async listItems(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListReviewItemsQueryDto,
  ) {
    return this.svc.listItems(organizationId, query);
  }
}
