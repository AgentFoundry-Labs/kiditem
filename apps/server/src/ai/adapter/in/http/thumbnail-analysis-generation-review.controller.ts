import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { DeleteCandidateDto, SelectCandidateDto } from './dto/thumbnail-edit.dto';
import { ThumbnailGenerationService } from '../../../application/service/thumbnail-generation.service';

@Controller('thumbnail-analysis')
export class ThumbnailAnalysisGenerationReviewController {
  constructor(private readonly generationService: ThumbnailGenerationService) {}

  @Get('generations')
  listGenerations(
    @CurrentOrganization() organizationId: string,
    @Query('productId') productId?: string,
    @Query('sourceCandidateId') sourceCandidateId?: string,
    @Query('contentWorkspaceId') contentWorkspaceId?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.generationService.findAll(organizationId, {
      productId: productId || null,
      sourceCandidateId: sourceCandidateId || null,
      contentWorkspaceId: contentWorkspaceId || null,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @Get('generations/:id')
  getGeneration(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.generationService.findOne(id, organizationId);
  }

  @Put('generations/:id/select')
  selectCandidate(
    @Param('id') id: string,
    @Body() body: SelectCandidateDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.generationService.selectCandidate(id, organizationId, body.selectedUrl);
  }

  /**
   * "선택 대기" 탭의 모든 generation 의 `selectedUrl` 일괄 해제.
   * Frontend (`/thumbnails` AI 편집 탭) 가 ready 탭 진입 시 호출.
   */
  @Put('generations/clear-ready-selections')
  clearReadySelections(@CurrentOrganization() organizationId: string) {
    return this.generationService.clearReadySelections(organizationId);
  }

  @Put('generations/:id/apply')
  applyGeneration(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.generationService.applyGeneration(id, organizationId, authUser?.id ?? null);
  }

  @Put('generations/:id/skip')
  skipGeneration(
    @Param('id') id: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.generationService.skipGeneration(id, organizationId, authUser?.id ?? null);
  }

  @Delete('generations/:id')
  deleteGeneration(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.generationService.deleteGeneration(id, organizationId);
  }

  @Delete('generations/:id/candidates')
  deleteCandidate(
    @Param('id') id: string,
    @Body() body: DeleteCandidateDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.generationService.removeCandidate(id, organizationId, body.url);
  }
}
