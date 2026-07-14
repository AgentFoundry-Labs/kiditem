import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ContentArchiveService } from '../../../application/service/content-archive.service';
import { ListContentArchiveQueryDto } from './dto/content-archive.dto';

@Controller('ai/content-archive/sourcing')
export class ContentArchiveLinkageController {
  constructor(private readonly archive: ContentArchiveService) {}

  @Get(':candidateId')
  listForSourcingCandidate(
    @CurrentOrganization() organizationId: string,
    @Param('candidateId', new ParseUUIDPipe()) candidateId: string,
    @Query() query: ListContentArchiveQueryDto,
  ) {
    return this.archive.listForSourcingCandidate(organizationId, candidateId, {
      page: query.page,
      limit: query.limit,
      contentType: query.contentType ?? null,
      status: query.status ?? null,
      contentWorkspaceId: query.contentWorkspaceId ?? null,
    });
  }
}
