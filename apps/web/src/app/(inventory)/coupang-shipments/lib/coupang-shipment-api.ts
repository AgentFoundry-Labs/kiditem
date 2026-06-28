import { apiClient } from '@/lib/api-client';

export type CoupangShipmentServerFileKind = 'label' | 'statement' | 'all';

export type CoupangShipmentServerFile = {
  id: string;
  runId: string;
  date: string;
  kind: CoupangShipmentServerFileKind;
  fileName: string;
  downloadPath: string;
  sizeBytes: number;
  sourceCount: number;
  pageCount: number;
  centers: string[];
  createdAt: string;
};

export type CoupangShipmentServerDay = {
  date: string;
  files: CoupangShipmentServerFile[];
  runCount: number;
  updatedAt: string | null;
};

export type CoupangShipmentServerFilesResponse = {
  rootPath: string;
  totalFiles: number;
  days: CoupangShipmentServerDay[];
};

export function loadCoupangShipmentServerFiles(): Promise<CoupangShipmentServerFilesResponse> {
  return apiClient.get<CoupangShipmentServerFilesResponse>('/api/coupang-shipments');
}

export async function downloadCoupangShipmentServerFile(file: CoupangShipmentServerFile): Promise<Blob> {
  const response = await apiClient.fetchRaw(file.downloadPath);
  if (!response.ok) {
    throw new Error('쿠팡 쉽먼트 파일을 내려받지 못했습니다.');
  }
  return response.blob();
}
