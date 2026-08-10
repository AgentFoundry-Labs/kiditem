import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import type { AuthUser } from '../../../../auth/auth.types';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { SourcingReviewService } from '../../../application/service/sourcing-review.service';
import { SourcingValidationService } from '../../../application/service/sourcing-validation.service';
import {
  SourcingReviewBatchDto,
  SourcingReviewBatchParamsDto,
  SourcingReviewItemKeyParamsDto,
  SourcingReviewSelectionDto,
  SourcingReviewSelectionListQueryDto,
  SourcingValidationQueryDto,
} from './dto';

@Controller('sourcing/workspace')
export class SourcingReviewController {
  constructor(
    private readonly validation: SourcingValidationService,
    private readonly review: SourcingReviewService,
  ) {}

  @Get('validation')
  listValidation(
    @Query() query: SourcingValidationQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.validation.latest({
      organizationId,
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  @Post('validation/refresh')
  refreshValidation(@CurrentOrganization() organizationId: string) {
    return this.validation.refresh({ organizationId, limit: 50 });
  }

  @Get('review-selections')
  listSelections(
    @Query() query: SourcingReviewSelectionListQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.review.listSelections({ organizationId, ...query });
  }

  @Put('review-selections/:itemKey')
  saveSelection(
    @Param() params: SourcingReviewItemKeyParamsDto,
    @Body() body: SourcingReviewSelectionDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.review.saveSelection({
      organizationId,
      itemKey: params.itemKey,
      workspaceKey: body.workspaceKey,
      recommendationRunId: body.recommendationRunId,
      state: body.state,
      expectedVersion: body.expectedVersion,
    });
  }

  @Post('review-batches')
  createBatch(
    @Body() body: SourcingReviewBatchDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.review.createBatch({
      organizationId,
      requestedByUserId: user.id,
      recommendationRunId: body.recommendationRunId,
      itemKeys: body.itemKeys,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Get('review-batches/:id')
  getBatch(
    @Param() params: SourcingReviewBatchParamsDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.review.getBatch(organizationId, params.id);
  }
}
