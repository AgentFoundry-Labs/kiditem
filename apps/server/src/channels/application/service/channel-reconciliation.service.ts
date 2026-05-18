import { Inject, Injectable, Optional } from '@nestjs/common';
import type {
  ReconciliationItem,
  ReconciliationItemListResponse,
  ReconciliationScanResponse,
  ReconciliationSummary,
} from '@kiditem/shared/channel-reconciliation';
import {
  type PrismaLike,
  type ReconciliationRowInput,
} from './channel-reconciliation.types';
import { ChannelReconciliationQueryService } from './channel-reconciliation-query.service';
import { ChannelReconciliationResolutionService } from './channel-reconciliation-resolution.service';
import { ChannelReconciliationScanService } from './channel-reconciliation-scan.service';
import {
  CHANNELS_OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../port/out/operation-alert.port';

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

/**
 * Public facade for controller/adapter consumers.
 *
 * The implementation is split by use-case so scan/match/query/manual resolution
 * do not accumulate in one service again.
 */
@Injectable()
export class ChannelReconciliationService {
  constructor(
    private readonly scanService: ChannelReconciliationScanService,
    private readonly queryService: ChannelReconciliationQueryService,
    private readonly resolutionService: ChannelReconciliationResolutionService,
    @Optional()
    @Inject(CHANNELS_OPERATION_ALERT_PORT)
    private readonly operationAlerts?: OperationAlertPort,
  ) {}

  scanFromRows(
    organizationId: string,
    rows: ReconciliationRowInput[],
    source:
      | 'coupang_image_sync'
      | 'wing_inventory'
      | 'seller_products'
      | 'manual' = 'coupang_image_sync',
  ): Promise<ReconciliationScanResponse> {
    return this.scanService.scanFromRows(organizationId, rows, source);
  }

  syncFromImageSyncedListings(organizationId: string): Promise<ReconciliationScanResponse> {
    return this.scanService.syncFromImageSyncedListings(organizationId);
  }

  async syncFromImageSyncedListingsWithAlert(
    organizationId: string,
    actorUserId: string,
  ): Promise<ReconciliationScanResponse> {
    const alerts = this.requireOperationAlerts();
    await alerts.start({
      organizationId,
      actorUserId,
      ...IMAGE_LISTING_RECONCILIATION_ALERT,
      message: '이미지 동기화 기반 쿠팡 매칭 큐를 재구성하는 중입니다.',
      progress: 0,
    });

    try {
      const result = await this.syncFromImageSyncedListings(organizationId);
      await alerts.succeed(
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
      await alerts.fail(
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

  getSummary(organizationId: string): Promise<ReconciliationSummary> {
    return this.queryService.getSummary(organizationId);
  }

  listItems(
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
      status?: string;
      resolutionSource?: string;
      search?: string;
    },
  ): Promise<ReconciliationItemListResponse> {
    return this.queryService.listItems(organizationId, params);
  }

  linkItem(
    itemId: string,
    organizationId: string,
    body: { productOptionId: string },
  ): Promise<ReconciliationItem> {
    return this.resolutionService.linkItem(itemId, organizationId, body);
  }

  ignoreItem(
    itemId: string,
    organizationId: string,
    body: { reason?: string | null },
  ): Promise<ReconciliationItem> {
    return this.resolutionService.ignoreItem(itemId, organizationId, body);
  }

  private requireOperationAlerts(): OperationAlertPort {
    if (!this.operationAlerts) {
      throw new Error('CHANNELS_OPERATION_ALERT_PORT is not configured');
    }
    return this.operationAlerts;
  }
}

export type { PrismaLike, ReconciliationRowInput };
