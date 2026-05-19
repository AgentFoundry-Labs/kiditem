import { Inject, Injectable } from '@nestjs/common';
import {
  CHANNEL_RECONCILIATION_SCAN_REPOSITORY_PORT,
  type ChannelReconciliationScanRepositoryPort,
  type ReconciliationRowInput,
} from '../port/out/repository/channel-reconciliation.repository.port';

@Injectable()
export class ChannelReconciliationScanService {
  constructor(
    @Inject(CHANNEL_RECONCILIATION_SCAN_REPOSITORY_PORT)
    private readonly repository: ChannelReconciliationScanRepositoryPort,
  ) {}

  scanFromRows(
    organizationId: string,
    rows: ReconciliationRowInput[],
    source:
      | 'coupang_image_sync'
      | 'wing_inventory'
      | 'seller_products'
      | 'manual' = 'coupang_image_sync',
  ) {
    return this.repository.scanFromRows(organizationId, rows, source);
  }

  syncFromImageSyncedListings(organizationId: string) {
    return this.repository.syncFromImageSyncedListings(organizationId);
  }
}
