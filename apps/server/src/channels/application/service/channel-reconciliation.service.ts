import { Injectable } from '@nestjs/common';
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
}

export type { PrismaLike, ReconciliationRowInput };
