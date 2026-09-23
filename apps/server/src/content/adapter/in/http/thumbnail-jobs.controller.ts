import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { EditJobsDto, ReEditDto } from './dto/thumbnail-edit.dto';
import { ThumbnailGenerationService } from '../../../application/service/thumbnail-generation.service';

/** 썸네일 편집 job 을 만든다(`/api/ai/thumbnail-jobs`). */
@Controller('ai/thumbnail-jobs')
export class ThumbnailJobsController {
  constructor(private readonly generationService: ThumbnailGenerationService) {}

  // ─── 편집 jobs (현재 main 에서는 unavailable) ────────────────────

  @Post('edit')
  createEditJobs(
    @Body() body: EditJobsDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.generationService.createEditJobs(
      body.contentWorkspaceIds,
      organizationId,
      body.purpose ?? 'compliance',
      body.variantKey ?? null,
      user.id,
    );
  }

  @Post(':id/re-edit')
  reEditGeneration(
    @Param('id') id: string,
    @Body() body: ReEditDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.generationService.reEditJob(
      id,
      organizationId,
      body?.purpose ?? 'compliance',
      body?.variantKey ?? null,
    );
  }
}
