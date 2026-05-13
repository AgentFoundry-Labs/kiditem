import { Controller, Delete, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
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
      linkState: query.linkState ?? null,
      status: query.status ?? null,
      productId: query.productId ?? null,
      sourceCandidateId: query.sourceCandidateId ?? null,
    });
  }

  @Get('products/:productId')
  listProductWorkspace(
    @CurrentOrganization() organizationId: string,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Query() query: ListContentArchiveQueryDto,
  ) {
    return this.archive.listProductWorkspace(organizationId, productId, {
      page: query.page,
      limit: query.limit,
      contentType: query.contentType ?? null,
      status: query.status ?? null,
      sourceCandidateId: query.sourceCandidateId ?? null,
    });
  }

  @Delete('products/:productId')
  deleteProductWorkspace(
    @CurrentOrganization() organizationId: string,
    @Param('productId', new ParseUUIDPipe()) productId: string,
  ) {
    return this.archive.deleteProductWorkspace(organizationId, productId);
  }

  @Get('groups/:groupId')
  listGroupWorkspace(
    @CurrentOrganization() organizationId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Query() query: ListContentArchiveQueryDto,
  ) {
    return this.archive.listGroupWorkspace(organizationId, groupId, {
      page: query.page,
      limit: query.limit,
      contentType: query.contentType ?? null,
      status: query.status ?? null,
      sourceCandidateId: query.sourceCandidateId ?? null,
    });
  }

  @Delete('groups/:groupId')
  deleteGroupWorkspace(
    @CurrentOrganization() organizationId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
  ) {
    return this.archive.deleteGroupWorkspace(organizationId, groupId);
  }
}
