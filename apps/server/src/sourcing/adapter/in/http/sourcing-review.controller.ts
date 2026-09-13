import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
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
import type { AuthUser } from '../../../../auth/auth.types';

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
  refreshValidation(@CurrentOrganization() organizationId: string, @Body() body?: unknown) {
    if (body && Object.keys(body).length > 0) {
      const parsed = z.object({ recommendationRunId: z.string().uuid() }).strict().safeParse(body);
      if (!parsed.success) throw new BadRequestException('INVALID_RECOMMENDATION_RUN');
      return this.validation.refreshForRun({ organizationId, recommendationRunId: parsed.data.recommendationRunId, limit: 50 });
    }
    return this.validation.refresh({ organizationId, limit: 50 });
  }

  @Get('review-selections')
  async listSelections(
    @Query() query: SourcingReviewSelectionListQueryDto,
    @CurrentOrganization() organizationId: string,
  ) {
    const selections = await this.review.listSelections({ organizationId, ...query });
    return selections.map(toReviewSelectionResponse);
  }

  @Put('review-selections/:itemKey')
  async saveSelection(
    @Param() params: SourcingReviewItemKeyParamsDto,
    @Body() body: SourcingReviewSelectionDto,
    @CurrentOrganization() organizationId: string,
  ) {
    const selection = await this.review.saveSelection({
      organizationId,
      itemKey: params.itemKey,
      workspaceKey: body.workspaceKey,
      recommendationRunId: body.recommendationRunId,
      state: body.state,
      expectedVersion: body.expectedVersion,
    });
    return toReviewSelectionResponse(selection);
  }

  @Post('review-batches')
  async createBatch(
    @Body() body: SourcingReviewBatchDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const batch = await this.review.createBatch({
      organizationId,
      requestedByUserId: user.id,
      recommendationRunId: body.recommendationRunId,
      itemKeys: body.itemKeys,
      idempotencyKey: body.idempotencyKey,
    });
    return toReviewBatchResponse(batch);
  }

  @Get('review-batches/:id')
  async getBatch(
    @Param() params: SourcingReviewBatchParamsDto,
    @CurrentOrganization() organizationId: string,
  ) {
    const batch = await this.review.getBatch(organizationId, params.id);
    return toReviewBatchResponse(batch);
  }
}

function toReviewSelectionResponse(selection: {
  workspaceKey: 'entry' | 'final';
  recommendationRunId: string;
  itemKey: string;
  state: 'neutral' | 'selected' | 'removed';
  version: number;
  updatedAt: Date;
}) {
  return {
    workspaceKey: selection.workspaceKey,
    recommendationRunId: selection.recommendationRunId,
    itemKey: selection.itemKey,
    state: selection.state,
    version: selection.version,
    updatedAt: selection.updatedAt.toISOString(),
  };
}

function toReviewBatchResponse(batch: {
  id: string;
  status: 'awaiting_procurement_enablement' | 'cancelled';
  itemCount: number;
  createdAt: Date;
}) {
  return {
    id: batch.id,
    status: batch.status,
    itemCount: batch.itemCount,
    createdAt: batch.createdAt.toISOString(),
  };
}
