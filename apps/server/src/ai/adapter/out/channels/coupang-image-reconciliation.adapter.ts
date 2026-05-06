import { Injectable } from '@nestjs/common';
import { ChannelReconciliationService } from '../../../../channels/application/service/channel-reconciliation.service';
import type {
  CoupangImageReconciliationPort,
  RecordCoupangImageRowsInput,
} from '../../../application/port/out/coupang-image-reconciliation.port';

@Injectable()
export class CoupangImageReconciliationAdapter implements CoupangImageReconciliationPort {
  constructor(private readonly reconciliation: ChannelReconciliationService) {}

  async recordRows(input: RecordCoupangImageRowsInput): Promise<void> {
    const rows = input.rows
      .filter((row) => row.inventoryId)
      .map((row) => ({
        externalId: row.inventoryId,
        legacyCode: row.legacyCode ?? null,
        channelProductName: row.name ?? null,
        channelImageUrl: row.url ?? null,
      }));

    if (rows.length === 0) return;
    await this.reconciliation.scanFromRows(
      input.organizationId,
      rows,
      'coupang_image_sync',
    );
  }
}
