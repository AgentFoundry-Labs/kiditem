import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ChannelReconciliationService } from '../../../application/service/channel-reconciliation.service';
import { CurrentOrganization } from '../../../../auth/decorators/current-organization.decorator';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../../../auth/auth.types';
import {
  CHANNELS_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../../../application/port/out/operation-alert.port';
import {
  CoupangReconciliationIgnoreDto,
  CoupangReconciliationLinkDto,
  CoupangReconciliationListQueryDto,
  CoupangReconciliationScanDto,
} from './dto';

const IMAGE_LISTING_RECONCILIATION_ALERT = {
  operationKey: 'channel-reconciliation:sync-from-image-listings',
  type: 'channel_reconciliation_sync',
  title: '이미지 동기화 데이터 점검',
  sourceType: 'channel_reconciliation',
  sourceId: 'sync-from-image-listings',
  href: '/product-hub/matching',
} as const;

function scanSummaryMessage(result: {
  totalCount: number;
  autoLinkedCount: number;
  needsReviewCount: number;
  conflictCount: number;
  errorCount: number;
}): string {
  return `이미지 동기화 데이터 점검 완료: 총 ${result.totalCount}건, 자동 연결 ${result.autoLinkedCount}건, 확인 필요 ${result.needsReviewCount}건, 충돌 ${result.conflictCount}건`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

@Controller('channels/reconciliation/coupang')
export class ChannelReconciliationController {
  constructor(
    private readonly service: ChannelReconciliationService,
    @Inject(CHANNELS_OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
  ) {}

  @Post('scan-from-rows')
  async scanFromRows(
    @Body() body: CoupangReconciliationScanDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.scanFromRows(
      organizationId,
      body.rows,
      body.source ?? 'coupang_image_sync',
    );
  }

  @Post('sync-from-image-listings')
  async syncFromImageListings(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.operationAlerts.start({
      organizationId,
      actorUserId: user.id,
      ...IMAGE_LISTING_RECONCILIATION_ALERT,
      message: '이미지 동기화 기반 쿠팡 매칭 큐를 재구성하는 중입니다.',
      progress: 0,
    });

    try {
      const result = await this.service.syncFromImageSyncedListings(organizationId);
      await this.operationAlerts.succeed(
        organizationId,
        IMAGE_LISTING_RECONCILIATION_ALERT.operationKey,
        {
          message: scanSummaryMessage(result),
          href: IMAGE_LISTING_RECONCILIATION_ALERT.href,
          severity:
            result.needsReviewCount + result.conflictCount + result.errorCount > 0
              ? 'warning'
              : 'info',
          metadata: {
            runId: result.runId,
            totalCount: result.totalCount,
            alreadyLinkedCount: result.alreadyLinkedCount,
            autoLinkedCount: result.autoLinkedCount,
            needsReviewCount: result.needsReviewCount,
            conflictCount: result.conflictCount,
            errorCount: result.errorCount,
            optionLinkedCount: result.optionLinkedCount,
            optionLinkAmbiguousCount: result.optionLinkAmbiguousCount,
            optionLinkNoCandidateCount: result.optionLinkNoCandidateCount,
          },
        },
      );
      return result;
    } catch (error: unknown) {
      await this.operationAlerts.fail(
        organizationId,
        IMAGE_LISTING_RECONCILIATION_ALERT.operationKey,
        {
          message: `이미지 동기화 데이터 점검 실패: ${errorMessage(error)}`,
          href: IMAGE_LISTING_RECONCILIATION_ALERT.href,
          metadata: { error: errorMessage(error) },
        },
      );
      throw error;
    }
  }

  @Get('summary')
  async getSummary(@CurrentOrganization() organizationId: string) {
    return this.service.getSummary(organizationId);
  }

  @Get('items')
  async listItems(
    @CurrentOrganization() organizationId: string,
    @Query() query: CoupangReconciliationListQueryDto,
  ) {
    return this.service.listItems(organizationId, {
      page: query.page,
      limit: query.limit,
      status: query.status,
      resolutionSource: query.resolutionSource,
      search: query.search,
    });
  }

  @Post('items/:id/link')
  async linkItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CoupangReconciliationLinkDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.linkItem(id, organizationId, {
      productOptionId: body.productOptionId,
    });
  }

  @Post('items/:id/ignore')
  async ignoreItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CoupangReconciliationIgnoreDto,
    @CurrentOrganization() organizationId: string,
  ) {
    return this.service.ignoreItem(id, organizationId, {
      reason: body.reason ?? null,
    });
  }
}
