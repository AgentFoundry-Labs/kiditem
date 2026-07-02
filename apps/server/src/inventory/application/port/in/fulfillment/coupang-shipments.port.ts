export const COUPANG_SHIPMENTS_PORT = Symbol('CoupangShipmentsPort');

export type CoupangShipmentMergedFileKind = 'label' | 'statement' | 'all';

export type CoupangShipmentMergedFileItem = {
  id: string;
  runId: string;
  date: string;
  kind: CoupangShipmentMergedFileKind;
  fileName: string;
  downloadPath: string;
  sizeBytes: number;
  sourceCount: number;
  pageCount: number;
  centers: string[];
  createdAt: string;
};

export type CoupangShipmentDailyFiles = {
  date: string;
  files: CoupangShipmentMergedFileItem[];
  runCount: number;
  updatedAt: string | null;
};

export type CoupangShipmentFilesResponse = {
  rootPath: string;
  totalFiles: number;
  days: CoupangShipmentDailyFiles[];
};

export type CoupangShipmentFileRequest = {
  runId: string;
  date: string;
  fileName: string;
};

export type CoupangShipmentResolvedFile = {
  path: string;
  fileName: string;
  sizeBytes: number;
};

export interface CoupangShipmentsPort {
  listLocalFiles(organizationId: string): Promise<CoupangShipmentFilesResponse>;
  resolveLocalFile(
    organizationId: string,
    input: CoupangShipmentFileRequest,
  ): Promise<CoupangShipmentResolvedFile>;
}
