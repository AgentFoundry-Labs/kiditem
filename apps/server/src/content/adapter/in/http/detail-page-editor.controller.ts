import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { DetailPageAiService } from '../../../application/service/detail-page-ai.service';
import {
  RenameDetailPageVersionDto,
  SaveDetailPageEditedHtmlDto,
} from './dto/detail-page-editor.dto';

@Controller('ai/detail-page')
export class DetailPageEditorController {
  constructor(private readonly service: DetailPageAiService) {}

  @Get()
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  list(
    @CurrentOrganization() organizationId: string,
    @Query('contentWorkspaceId', new ParseUUIDPipe({ optional: true })) contentWorkspaceId?: string,
    @Query('templateId') templateId?: string,
    @Query('sourceCandidateId') sourceCandidateId?: string,
  ) {
    // 거르지 못하는 필터를 조용히 무시하면 조직 전체의 최근 상세페이지가 한 상품의 이력처럼 보인다.
    if (sourceCandidateId !== undefined) {
      throw new BadRequestException('sourceCandidateId는 제거되었습니다. contentWorkspaceId를 사용하세요');
    }
    return this.service.list(organizationId, {
      contentWorkspaceId,
      templateId,
    });
  }

  @Get(':id')
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.getById(id, organizationId);
  }

  /** 상세 페이지와 그 revision 이력(KID-313 W3b). */
  @Get(':id/revisions')
  getRevisions(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.getWithRevisions(id, organizationId);
  }

  @Post(':id/edited-html')
  saveEditedHtml(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
    @Body() body: SaveDetailPageEditedHtmlDto,
  ) {
    return this.service.saveEditedHtml(id, organizationId, body.html);
  }

  @Get(':id/edited-html')
  getEditedHtml(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.getEditedHtml(id, organizationId);
  }

  @Post(':id/duplicate')
  duplicateVersion(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.duplicateVersion(id, organizationId, user.id);
  }

  @Patch(':id/title')
  renameVersion(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
    @Body() body: RenameDetailPageVersionDto,
  ) {
    return this.service.renameVersion(id, organizationId, body.title);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.cancel(id, organizationId);
  }

  @Delete(':id')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.remove(id, organizationId);
  }
}
