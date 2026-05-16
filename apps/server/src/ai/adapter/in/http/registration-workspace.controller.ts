import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { RegistrationWorkspaceService } from '../../../application/service/registration-workspace.service';
import {
  CreateRegistrationWorkspaceDto,
  DuplicateRegistrationWorkspaceQueryDto,
  ListRegistrationWorkspacesQueryDto,
  SelectRegistrationWorkspaceDetailPageDto,
} from './dto/registration-workspace.dto';

@Controller('ai/registration-workspaces')
export class RegistrationWorkspaceController {
  constructor(private readonly registrationWorkspaces: RegistrationWorkspaceService) {}

  @Get()
  list(
    @CurrentOrganization() organizationId: string,
    @Query() query: ListRegistrationWorkspacesQueryDto,
  ) {
    return this.registrationWorkspaces.list(organizationId, {
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
    @Body() body: CreateRegistrationWorkspaceDto,
  ) {
    return this.registrationWorkspaces.createWorkspace({
      organizationId,
      triggeredByUserId: user.id,
      rawTitle: body.title,
      sourceCandidateId: body.sourceCandidateId ?? null,
      targetMasterId: body.targetMasterId ?? null,
    });
  }

  @Get('duplicate-check')
  duplicateCheck(
    @CurrentOrganization() organizationId: string,
    @Query() query: DuplicateRegistrationWorkspaceQueryDto,
  ) {
    return this.registrationWorkspaces.checkDuplicate(organizationId, query.title);
  }

  @Get(':workspaceId')
  get(
    @CurrentOrganization() organizationId: string,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
  ) {
    return this.registrationWorkspaces.get(organizationId, workspaceId);
  }

  @Patch(':workspaceId/current-detail-page')
  selectCurrentDetailPage(
    @CurrentOrganization() organizationId: string,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: SelectRegistrationWorkspaceDetailPageDto,
  ) {
    return this.registrationWorkspaces.selectCurrentDetailPage({
      organizationId,
      workspaceId,
      contentGenerationId: body.contentGenerationId,
    });
  }

  @Delete(':workspaceId')
  archive(
    @CurrentOrganization() organizationId: string,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
  ) {
    return this.registrationWorkspaces.archive(organizationId, workspaceId);
  }
}
