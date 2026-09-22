import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { AuthUser } from '../../../../auth/auth.types';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { ContentGenerationRerunService } from '../../../application/service/content-generation-rerun.service';

@Controller('ai/content-archive')
export class ContentGenerationRerunController {
  constructor(private readonly rerun: ContentGenerationRerunService) {}

  @Post(':generationId/rerun')
  rerunSameInput(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('generationId', new ParseUUIDPipe()) generationId: string,
  ) {
    return this.rerun.rerunSameInput(generationId, organizationId, user.id);
  }
}
