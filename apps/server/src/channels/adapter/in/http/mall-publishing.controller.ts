import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  UpsertMallListingProfileSchema,
  type MallAdapterManifestView,
  type MallAvailabilityPreview,
  type MallChannelOverview,
  type MallListingMatrixResponse,
  type MallListingProfile,
  type MallNoticeBackfillResult,
  type MallPreflightResponse,
  type MallPublishTarget,
} from '@kiditem/shared/mall-publishing';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { MallPublishingService } from '../../../application/service/mall-publishing.service';
import {
  MallAvailabilityPreviewQueryDto,
  MallMatrixQueryDto,
  MallPreflightQueryDto,
} from './dto/mall-publishing.dto';

/**
 * 몰별 상품등록·품절 관리.
 *
 * Phase 0 는 읽기와 프로필 편집뿐이다. 이 컨트롤러의 어떤 경로도 몰에 요청을
 * 보내지 않는다.
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

  @Get('profiles')
  listProfiles(
    @CurrentOrganization() organizationId: string,
    @Query('mallKey') mallKey?: string,
  ): Promise<MallListingProfile[]> {
    return this.mallPublishing.listProfiles(organizationId, mallKey?.trim() || undefined);
  }

  @Post('profiles/:mallKey')
  @Roles('owner', 'admin')
  createProfile(
    @CurrentOrganization() organizationId: string,
    @Param('mallKey') mallKey: string,
    @Body() body: unknown,
  ): Promise<MallListingProfile> {
    return this.mallPublishing.createProfile(organizationId, mallKey, parseProfileBody(body));
  }

  @Patch('profiles/:profileId')
  @Roles('owner', 'admin')
  updateProfile(
    @CurrentOrganization() organizationId: string,
    @Param('profileId') profileId: string,
    @Body() body: unknown,
  ): Promise<MallListingProfile> {
    return this.mallPublishing.updateProfile(organizationId, profileId, parseProfileBody(body));
  }

  @Delete('profiles/:profileId')
  @Roles('owner', 'admin')
  @HttpCode(204)
  async deleteProfile(
    @CurrentOrganization() organizationId: string,
    @Param('profileId') profileId: string,
  ): Promise<void> {
    await this.mallPublishing.deleteProfile(organizationId, profileId);
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
   * 쿠팡 리스팅에서 상품정보고시를 역추출한다.
   *
   * `dryRun=true`(기본)이면 아무것도 쓰지 않고 결과만 센다. 몰에는 어느 쪽이든
   * 아무 요청도 가지 않는다.
   */
  @Post('notice-backfill')
  @Roles('owner', 'admin')
  @HttpCode(200)
  backfillNotices(
    @CurrentOrganization() organizationId: string,
    @Query('dryRun') dryRun?: string,
  ): Promise<MallNoticeBackfillResult> {
    return this.mallPublishing.backfillNoticesFromCoupang(organizationId, {
      dryRun: dryRun !== 'false',
    });
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

function parseProfileBody(body: unknown) {
  const parsed = UpsertMallListingProfileSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(
      parsed.error.issues
        .map((issue: { path: PropertyKey[]; message: string }) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', '),
    );
  }
  return parsed.data;
}
