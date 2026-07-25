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

export type CoupangShipmentDateSummaryEntry = {
  date: string;
  count: number;
  boxes: number;
  capturedAt: string;
};

export type CoupangShipmentDateSummaryResponse = {
  items: CoupangShipmentDateSummaryEntry[];
};

/** DB에 저장된 발송일별 요약(건수·박스)을 불러온다. 새로고침해도 달력이 유지되도록. */
export function loadCoupangShipmentDateSummary(): Promise<CoupangShipmentDateSummaryResponse> {
  return apiClient.get<CoupangShipmentDateSummaryResponse>('/api/coupang-shipments/date-summary');
}

/** 조회한 발송일별 요약을 DB에 upsert(신규 추가·기존 갱신)하고 전체 세트를 돌려받는다. */
export function saveCoupangShipmentDateSummary(
  items: Array<{ date: string; count: number; boxes: number }>,
): Promise<CoupangShipmentDateSummaryResponse> {
  return apiClient.put<CoupangShipmentDateSummaryResponse>('/api/coupang-shipments/date-summary', {
    items,
  });
}

export async function downloadCoupangShipmentServerFile(file: CoupangShipmentServerFile): Promise<Blob> {
  const response = await apiClient.fetchRaw(file.downloadPath);
  if (!response.ok) {
    throw new Error('쿠팡 쉽먼트 파일을 내려받지 못했습니다.');
  }
  return response.blob();
}
