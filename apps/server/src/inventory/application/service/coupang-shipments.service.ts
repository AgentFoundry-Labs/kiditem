import { Inject, Injectable } from '@nestjs/common';

import type {
  CoupangShipmentDateSummaryResult,
  CoupangShipmentFileRequest,
  CoupangShipmentFilesResponse,
  CoupangShipmentResolvedFile,
  CoupangShipmentsPort,
} from '../port/in/fulfillment';
import {
  COUPANG_SHIPMENT_FILE_STORAGE_PORT,
  type CoupangShipmentFileStoragePort,
} from '../port/out/storage';
import {
  COUPANG_SHIPMENT_DATE_SUMMARY_REPOSITORY_PORT,
  type CoupangShipmentDateSummaryRepositoryPort,
} from '../port/out/repository/coupang-shipment-date-summary.repository.port';

@Injectable()
export class CoupangShipmentsService implements CoupangShipmentsPort {
  constructor(
    @Inject(COUPANG_SHIPMENT_FILE_STORAGE_PORT)
    private readonly storage: CoupangShipmentFileStoragePort,
    @Inject(COUPANG_SHIPMENT_DATE_SUMMARY_REPOSITORY_PORT)
    private readonly dateSummary: CoupangShipmentDateSummaryRepositoryPort,
  ) {}

  listLocalFiles(organizationId: string): Promise<CoupangShipmentFilesResponse> {
    return this.storage.listMergedFiles(organizationId);
  }

  resolveLocalFile(
    organizationId: string,
    input: CoupangShipmentFileRequest,
  ): Promise<CoupangShipmentResolvedFile> {
    return this.storage.resolveMergedFile(organizationId, input);
  }

  async listDateSummary(
    organizationId: string,
  ): Promise<CoupangShipmentDateSummaryResult> {
    const items = await this.dateSummary.listDateSummary(organizationId);
    return { items };
  }

  async saveDateSummary(
    organizationId: string,
    items: Array<{ date: string; count: number; boxes: number }>,
  ): Promise<CoupangShipmentDateSummaryResult> {
    const persisted = await this.dateSummary.upsertDateSummary(organizationId, items);
    return { items: persisted };
  }
}
