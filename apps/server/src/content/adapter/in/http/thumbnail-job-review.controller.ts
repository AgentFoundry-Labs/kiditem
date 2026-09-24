import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import {
  CancelThumbnailGenerationDto,
  DeleteCandidateDto,
} from './dto/thumbnail-edit.dto';
import { ThumbnailGenerationService } from '../../../application/service/thumbnail-generation.service';
import {
  ThumbnailGenerationSubjectError,
  normalizeThumbnailGenerationListScope,
} from '../../../domain/thumbnail-generation-subject';

/**
 * 대표이미지 생성 job 목록 · 취소 · 삭제(KID-313 W3a). 응답은 job 과 그 후보(`ContentAssetItem`)다. 후보 채택은
 * `PATCH /ai/content-workspaces/:id/current-thumbnail` 하나다 — 옛 select · apply 두 단계는 없다.
 */
@Controller('ai/thumbnail-jobs')
export class ThumbnailJobReviewController {
  constructor(private readonly generationService: ThumbnailGenerationService) {}

  @Get()
  listGenerations(
    @CurrentOrganization() organizationId: string,
    @Query('productId') productId?: string,
    @Query('masterId') masterId?: string,
    @Query('sourceCandidateId') sourceCandidateId?: string,
    @Query('contentWorkspaceId') contentWorkspaceId?: string,
    @Query('scope') scope?: string,
    @Query('limit') limit?: string,
  ) {
    if (productId) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'FILTER_REMOVED', field: 'productId' }, message: 'productId는 제거되었습니다. contentWorkspaceId를 사용하세요' });
    }
    if (masterId) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'FILTER_REMOVED', field: 'masterId' }, message: 'masterId는 제거되었습니다. contentWorkspaceId를 사용하세요' });
    }
    if (sourceCandidateId) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'FILTER_REMOVED', field: 'sourceCandidateId' }, message: 'sourceCandidateId는 제거되었습니다. contentWorkspaceId를 사용하세요' });
    }
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    let normalizedScope: ReturnType<typeof normalizeThumbnailGenerationListScope>;
    try {
      normalizedScope = normalizeThumbnailGenerationListScope(scope);
    } catch (err) {
      if (err instanceof ThumbnailGenerationSubjectError) {
        throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'THUMBNAIL_SUBJECT_INVALID' }, message: err.message });
      }
      throw err;
    }
    return this.generationService.findAll(organizationId, {
      contentWorkspaceId: contentWorkspaceId || null,
      scope: normalizedScope,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @Get(':id')
  getGeneration(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.generationService.findOne(id, organizationId);
  }

  @Post(':id/cancel')
  cancelGeneration(
    @Param('id') id: string,
    @Body() body: CancelThumbnailGenerationDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.generationService.cancelGeneration({
      organizationId,
      generationId: id,
      actorUserId: user.id,
      reason: body.reason?.trim() || '사용자 요청으로 중단되었습니다.',
    });
  }

  @Put(':id/skip')
  skipGeneration(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.generationService.skipGeneration(id, organizationId);
  }

  @Delete(':id')
  deleteGeneration(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.generationService.deleteGeneration(id, organizationId);
  }

  @Delete(':id/candidates')
  deleteCandidate(
    @Param('id') id: string,
    @Body() body: DeleteCandidateDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.generationService.removeCandidate(id, organizationId, body.assetId);
  }
}
