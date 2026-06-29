import { Inject, Injectable } from '@nestjs/common';

import type {
  CoupangShipmentFileRequest,
  CoupangShipmentFilesResponse,
  CoupangShipmentResolvedFile,
  CoupangShipmentsPort,
} from '../port/in/fulfillment';
import {
  COUPANG_SHIPMENT_FILE_STORAGE_PORT,
  type CoupangShipmentFileStoragePort,
} from '../port/out/storage';

@Injectable()
export class CoupangShipmentsService implements CoupangShipmentsPort {
  constructor(
    @Inject(COUPANG_SHIPMENT_FILE_STORAGE_PORT)
    private readonly storage: CoupangShipmentFileStoragePort,
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
}
