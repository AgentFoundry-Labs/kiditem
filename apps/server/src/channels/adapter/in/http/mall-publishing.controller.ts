import { Controller, Get, Query } from '@nestjs/common';
import type {
  MallAdapterManifestView,
  MallAvailabilityPreview,
  MallChannelOverview,
  MallListingMatrixResponse,
  MallPreflightResponse,
  MallPublishTarget,
} from '@kiditem/shared/mall-publishing';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { MallPublishingService } from '../../../application/service/mall-publishing.service';
import {
  MallAvailabilityPreviewQueryDto,
  MallMatrixQueryDto,
  MallPreflightQueryDto,
} from './dto/mall-publishing.dto';

/**
 * 몰별 상품등록·품절 관리.
 *
 * 전부 읽기다. 이 컨트롤러의 어떤 경로도 몰에 요청을 보내지 않고, 몰 계정 행도 쓰지
 * 않는다 — 몰 계정은 쇼핑몰 계정 화면(Orders)이 만들고 고친다.
 */
@Controller('channels/mall-publishing')
export class MallPublishingController {
  constructor(private readonly mallPublishing: MallPublishingService) {}

  @Get('manifests')
  listManifests(): MallAdapterManifestView[] {
    return this.mallPublishing.listManifests();
  }

  @Get('targets')
  listTargets(@CurrentOrganization() organizationId: string): Promise<MallPublishTarget[]> {
    return this.mallPublishing.listTargets(organizationId);
  }

  @Get('preflight')
  preflight(
    @CurrentOrganization() organizationId: string,
    @Query() query: MallPreflightQueryDto,
  ): Promise<MallPreflightResponse> {
    return this.mallPublishing.preflight(
      organizationId,
      {
        ...(query.mallKeys ? { mallKeys: query.mallKeys } : {}),
        ...(query.masterProductIds ? { masterProductIds: query.masterProductIds } : {}),
        ...(query.search ? { search: query.search } : {}),
        page: query.page,
        limit: query.limit,
      },
      new Date(),
    );
  }

  /**
   * 상품 × 몰 등록 현황. 읽기 전용이고 몰에는 아무 요청도 가지 않는다.
   */
  @Get('listing-matrix')
  listingMatrix(
    @CurrentOrganization() organizationId: string,
    @Query() query: MallMatrixQueryDto,
  ): Promise<MallListingMatrixResponse> {
    return this.mallPublishing.listingMatrix(organizationId, {
      ...(query.mallKeys ? { mallKeys: query.mallKeys } : {}),
      ...(query.filter ? { filter: query.filter } : {}),
      ...(query.search ? { search: query.search } : {}),
      page: query.page,
      limit: query.limit,
    });
  }

  /** 연결된 몰 요약. 허브 화면이 쓴다. */
  @Get('channel-overview')
  channelOverview(
    @CurrentOrganization() organizationId: string,
  ): Promise<MallChannelOverview> {
    return this.mallPublishing.channelOverview(organizationId);
  }

  @Get('availability-preview')
  previewAvailability(
    @CurrentOrganization() organizationId: string,
    @Query() query: MallAvailabilityPreviewQueryDto,
  ): Promise<MallAvailabilityPreview> {
    return this.mallPublishing.previewAvailability(organizationId, query.limit);
  }
}
