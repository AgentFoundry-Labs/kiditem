import { Controller, DefaultValuePipe, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { ThumbnailAutoService } from '../../../application/service/thumbnail-auto.service';

@Controller('thumbnail-auto')
export class ThumbnailAutoController {
  constructor(private readonly autoService: ThumbnailAutoService) {}

  @Post('batch')
  runBatch(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
  ) {
    return this.autoService.runBatch(organizationId, user.id, limit);
  }
}
