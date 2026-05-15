import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { EditJobsDto, ReEditDto } from './dto/thumbnail-edit.dto';
import { ThumbnailGenerationService } from '../../../application/service/thumbnail-generation.service';

@Controller('thumbnail-analysis')
export class ThumbnailAnalysisEditJobsController {
  constructor(private readonly generationService: ThumbnailGenerationService) {}

  // ─── 편집 jobs (현재 main 에서는 unavailable) ────────────────────

  @Post('edit-jobs')
  createEditJobs(
    @Body() body: EditJobsDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.generationService.createEditJobs(
      body.productIds,
      organizationId,
      body.purpose ?? 'compliance',
      body.variantKey ?? null,
      user.id,
    );
  }

  @Post('generations/:id/re-edit')
  reEditGeneration(
    @Param('id') id: string,
    @Body() body: ReEditDto,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.generationService.reEditJob(
      id,
      organizationId,
      body?.purpose ?? 'compliance',
      body?.variantKey ?? null,
      user.id,
    );
  }
}
