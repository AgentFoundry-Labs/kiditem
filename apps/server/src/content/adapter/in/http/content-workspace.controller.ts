import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import { ContentAssetService } from '../../../application/service/content-asset.service';
import { ContentWorkspaceService } from '../../../application/service/content-workspace.service';
import {
  REGISTRATION_CONTENT_WORKSPACE_PORT,
  type RegistrationContentWorkspacePort,
} from '../../../application/port/in/workspace/registration-content-workspace.port';
import {
  CreateContentWorkspaceDto,
  CreateManualDetailPageDto,
  DuplicateContentWorkspaceQueryDto,
  ListContentWorkspacesQueryDto,
  ReplaceContentWorkspaceThumbnailGalleryDto,
  SelectContentWorkspaceDetailPageDto,
  SelectContentWorkspaceThumbnailDto,
} from './dto/content-workspace.dto';

@Controller('ai/content-workspaces')
export class ContentWorkspaceController {
  constructor(
    private readonly contentWorkspaces: ContentWorkspaceService,
    private readonly contentAssets: ContentAssetService,
    @Inject(REGISTRATION_CONTENT_WORKSPACE_PORT)
    private readonly registrationContent: RegistrationContentWorkspacePort,
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
      salesProductId: body.salesProductId ?? null,
    });
  }

  @Get('duplicate-check')
  duplicateCheck(
    @CurrentOrganization() organizationId: string,
    @Query() query: DuplicateContentWorkspaceQueryDto,
  ) {
    return this.contentWorkspaces.checkDuplicate(organizationId, query.title);
  }

  @Get('by-sales-product/:salesProductId')
  getForSalesProduct(
    @CurrentOrganization() organizationId: string,
    @Param('salesProductId', new ParseUUIDPipe()) salesProductId: string,
  ) {
    return this.contentWorkspaces.getForSalesProduct(organizationId, salesProductId);
  }

  /** 초안의 등록용 사진(대표 · 썸네일 · 상세)과 저장한 대표 썸네일. 콘텐츠가 없으면 빈 목록과 null. */
  @Get('by-sales-product/:salesProductId/registration-media')
  getRegistrationMediaForSalesProduct(
    @CurrentOrganization() organizationId: string,
    @Param('salesProductId', new ParseUUIDPipe()) salesProductId: string,
  ) {
    return this.contentAssets.loadRegistrationMedia({ organizationId, salesProductId });
  }

  /**
   * 상세가 없는 판매상품에 첫 상세를 직접 쓴다(`manual_edit` revision, 현재가 된다). 이미 상세가 있으면 409 —
   * 그때는 그 상세 페이지의 edited-html 저장으로 고친다.
   */
  @Post('by-sales-product/:salesProductId/manual-detail-page')
  createManualDetailPage(
    @CurrentOrganization() organizationId: string,
    @Param('salesProductId', new ParseUUIDPipe()) salesProductId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: CreateManualDetailPageDto,
  ) {
    return this.registrationContent.createManualDetailPage({
      organizationId,
      salesProductId,
      html: body.html,
      createdByUserId: user.id ?? null,
    });
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
      detailPageId: body.detailPageId,
    });
  }

  /** 채택: 그 워크스페이스의 자산(업로드 · AI 후보) 하나를 대표이미지로(`currentThumbnailAssetId`). */
  @Patch(':workspaceId/current-thumbnail')
  selectCurrentThumbnail(
    @CurrentOrganization() organizationId: string,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: SelectContentWorkspaceThumbnailDto,
  ) {
    return this.contentAssets.adoptCurrentThumbnail({
      organizationId,
      contentWorkspaceId: workspaceId,
      assetId: body.assetId,
    });
  }

  /** 대표이미지 갤러리: 업로드와 AI 후보(`ContentAssetItem`), 새것부터. */
  @Get(':workspaceId/thumbnail-gallery')
  listThumbnailGallery(
    @CurrentOrganization() organizationId: string,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
  ) {
    return this.contentAssets.listThumbnailGallery({ organizationId, contentWorkspaceId: workspaceId });
  }

  /**
   * 워크스페이스가 소유한 썸네일 미리보기 목록(= `ContentAsset.role='thumbnail'`)을 통째로 교체한다.
   *
   * 썸네일 목록은 이 워크스페이스의 콘텐츠 자산이 유일한 저장처다 — 등록 대상은 고른 자산 id
   * (`selectedThumbnailAssetId`)만 갖는다(KID-313).
   */
  @Put(':workspaceId/thumbnail-gallery')
  replaceThumbnailGallery(
    @CurrentOrganization() organizationId: string,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: ReplaceContentWorkspaceThumbnailGalleryDto,
  ) {
    return this.contentAssets.replaceWorkspaceThumbnailGallery({
      organizationId,
      contentWorkspaceId: workspaceId,
      createdByUserId: user.id ?? null,
      thumbnailUrls: body.thumbnailUrls,
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
