// apps/server/src/orders/controllers/reviews.controller.ts
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../auth/decorators/current-organization.decorator';
import {
  ReviewIngestRequestSchema,
  ReviewIngestResponseSchema,
  ReviewItemListResponseSchema,
  ReviewListResponseSchema,
  type ReviewIngestResponse,
  type ReviewItemListResponse,
  type ReviewListResponse,
} from '@kiditem/shared/reviews';
import { ReviewsService } from '../services/reviews.service';
import { ReviewIngestService } from '../services/review-ingest.service';
import { ListReviewsQueryDto } from '../dto/list-reviews.dto';
import { ListReviewItemsQueryDto } from '../dto/list-review-items.dto';

// NOTE: no `@UseGuards`/`@UsePipes` — global APP_GUARD (OrganizationScopeGuard)
// + global ValidationPipe handle that. See apps/server/AGENTS.md.
@Controller('reviews')
export class ReviewsController {
  constructor(
    private readonly svc: ReviewsService,
    private readonly ingestSvc: ReviewIngestService,
  ) {}

  @Get()
  async list(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListReviewsQueryDto,
  ): Promise<ReviewListResponse> {
    const response = await this.svc.list(organizationId, query);
    return ReviewListResponseSchema.parse(response);
  }

  /** 수집된 상품평 원문 목록. 집계 테이블이 아니라 리뷰 1건씩 읽는 화면이 쓴다. */
  @Get('items')
  async listItems(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListReviewItemsQueryDto,
  ): Promise<ReviewItemListResponse> {
    const response = await this.svc.listItems(organizationId, query);
    return ReviewItemListResponseSchema.parse(response);
  }

  /** 확장이 크롤링한 채널 상품평 배치 적재. Zod 파싱은 shared 계약을 그대로 쓴다. */
  @Post('ingest')
  async ingest(
    @CurrentOrganization() organizationId: string,
    @Body() body: unknown,
  ): Promise<ReviewIngestResponse> {
    const request = ReviewIngestRequestSchema.parse(body);
    const response = await this.ingestSvc.ingest(organizationId, request);
    return ReviewIngestResponseSchema.parse(response);
  }
}
