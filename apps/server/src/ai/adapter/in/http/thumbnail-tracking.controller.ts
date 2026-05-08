import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { ListTrackingQueryDto, UpdateMetricsDto } from './dto/thumbnail-tracking.dto';
import { ThumbnailTrackingService } from '../../../application/service/thumbnail-tracking.service';

@Controller('thumbnail-tracking')
export class ThumbnailTrackingController {
  constructor(private readonly trackingService: ThumbnailTrackingService) {}

  @Get()
  list(@Query() query: ListTrackingQueryDto, @CurrentOrganization() organizationId: string) {
    return this.trackingService.findAll(
      { page: query.page, limit: query.limit, status: query.status },
      organizationId,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateMetricsDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.trackingService.updateMetrics(id, body, organizationId);
  }

  /**
   * 단일 tracking 의 daily snapshot 1개 수집 — playwriter 가 Wing 검색해서
   * 매출/판매량 추출. UI 에서 수동 trigger 또는 디버깅용.
   *
   * `(trackingId, capturedDate)` upsert — 같은 날 여러 번 호출하면 최신값으로 덮어씀.
   */
  @Post(':id/collect')
  collectSnapshot(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.trackingService.collectDailySnapshot(id, organizationId);
  }

  /** 단일 tracking 의 시계열 snapshot 목록 (차트용). */
  @Get(':id/snapshots')
  listSnapshots(@Param('id') id: string, @CurrentOrganization() organizationId: string) {
    return this.trackingService.listSnapshots(id, organizationId);
  }

  /**
   * 30일 이내 active tracking 모두 순회 — daily cron 의 HTTP-trigger 형태.
   * 추후 NestJS schedule 모듈 또는 외부 cron 으로 매일 한 번 호출.
   */
  @Post('collect-all-active')
  collectAllActive(@CurrentOrganization() organizationId: string) {
    return this.trackingService.collectAllActiveSnapshots(organizationId);
  }
}
