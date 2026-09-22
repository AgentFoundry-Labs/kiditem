import { Controller, Get, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ContentArchiveService } from '../../../application/service/content-archive.service';
import { ListContentArchiveQueryDto } from './dto/content-archive.dto';

@Controller('ai/content-archive')
export class ContentArchiveController {
  constructor(private readonly archive: ContentArchiveService) {}

  @Get('workspaces')
  listWorkspaces(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListContentArchiveQueryDto,
  ) {
    return this.archive.listWorkspaces(organizationId, {
      page: query.page,
      limit: query.limit,
      contentType: query.contentType ?? null,
      status: query.status ?? null,
      contentWorkspaceId: query.contentWorkspaceId ?? null,
      sourceCandidateId: query.sourceCandidateId ?? null,
    });
  }
}
