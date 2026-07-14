import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { ContentWorkspaceService } from '../../../application/service/content-workspace.service';
import { ContentWorkspaceThumbnailSelectionService } from '../../../application/service/content-workspace-thumbnail-selection.service';
import {
  CreateContentWorkspaceDto,
  DuplicateContentWorkspaceQueryDto,
  ListContentWorkspacesQueryDto,
  SelectContentWorkspaceDetailPageDto,
  SelectContentWorkspaceThumbnailDto,
} from './dto/content-workspace.dto';

@Controller('ai/content-workspaces')
export class ContentWorkspaceController {
  constructor(
    private readonly contentWorkspaces: ContentWorkspaceService,
    private readonly thumbnailSelections: ContentWorkspaceThumbnailSelectionService,
  ) {}

  @Get()
  list(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListContentWorkspacesQueryDto,
  ) {
    return this.contentWorkspaces.list(organizationId, {
      page: query.page,
      limit: query.limit,
      status: query.status ?? null,
      normalizedTitle: query.title ?? null,
    });
  }

  @Post()
  create(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: CreateContentWorkspaceDto,
  ) {
    return this.contentWorkspaces.createWorkspace({
      organizationId,
      triggeredByUserId: user.id,
      rawTitle: body.title,
      sourceCandidateId: body.sourceCandidateId ?? null,
    });
  }

  @Get('duplicate-check')
  duplicateCheck(
    @CurrentOrganization() organizationId: string,
    @Query() query: DuplicateContentWorkspaceQueryDto,
  ) {
    return this.contentWorkspaces.checkDuplicate(organizationId, query.title);
  }

  @Get(':workspaceId')
  get(
    @CurrentOrganization() organizationId: string,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
  ) {
    return this.contentWorkspaces.get(organizationId, workspaceId);
  }

  @Patch(':workspaceId/current-detail-page')
  selectCurrentDetailPage(
    @CurrentOrganization() organizationId: string,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: SelectContentWorkspaceDetailPageDto,
  ) {
    return this.contentWorkspaces.selectCurrentDetailPage({
      organizationId,
      workspaceId,
      contentGenerationId: body.contentGenerationId,
    });
  }

  @Patch(':workspaceId/current-thumbnail')
  selectCurrentThumbnail(
    @CurrentOrganization() organizationId: string,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: SelectContentWorkspaceThumbnailDto,
  ) {
    return this.thumbnailSelections.setCurrent({
      organizationId,
      workspaceId,
      userId: user.id ?? null,
      selection: {
        ...(body.contentAssetId ? { contentAssetId: body.contentAssetId } : {}),
        ...(body.sourceThumbnailGenerationId
          ? { sourceThumbnailGenerationId: body.sourceThumbnailGenerationId }
          : {}),
        ...(body.sourceThumbnailCandidateId
          ? { sourceThumbnailCandidateId: body.sourceThumbnailCandidateId }
          : {}),
        ...(body.externalUrl ? { externalUrl: body.externalUrl } : {}),
      },
    });
  }

  @Delete(':workspaceId')
  archive(
    @CurrentOrganization() organizationId: string,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
  ) {
    return this.contentWorkspaces.archive(organizationId, workspaceId);
  }
}
