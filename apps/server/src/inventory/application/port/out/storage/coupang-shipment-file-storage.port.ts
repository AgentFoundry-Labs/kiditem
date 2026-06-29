import type {
  CoupangShipmentFileRequest,
  CoupangShipmentFilesResponse,
  CoupangShipmentResolvedFile,
} from '../../in/fulfillment/coupang-shipments.port';

export const COUPANG_SHIPMENT_FILE_STORAGE_PORT = Symbol('CoupangShipmentFileStoragePort');

export interface CoupangShipmentFileStoragePort {
  listMergedFiles(organizationId: string): Promise<CoupangShipmentFilesResponse>;
  resolveMergedFile(
    organizationId: string,
    input: CoupangShipmentFileRequest,
  ): Promise<CoupangShipmentResolvedFile>;
}
