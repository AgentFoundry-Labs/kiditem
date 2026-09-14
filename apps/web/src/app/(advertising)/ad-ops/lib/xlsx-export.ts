import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';
import type { AdStrategyAction } from '@kiditem/shared/advertising';

export interface AdTrendExportPoint {
  businessDate: string;
  axisLabel: string;
  /** Null for a date the campaign sweep never measured; the cell stays empty. */
  leftValue: number | null;
  rightValue: number | null;
}

export interface AdTrendExportRequest {
  period: string;
  leftMetric: string;
  rightMetric: string;
  leftLabel: string;
  rightLabel: string;
  points: AdTrendExportPoint[];
}

/** Convert the already loaded strategy rows on the authenticated server. */
export async function exportCampaignXlsx(
  grade: string,
  actions: AdStrategyAction[],
  budget: number,
): Promise<void> {
  const response = await apiClient.fetchRaw('/api/ads/exports/campaign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grade, actions, budget }),
  });
  await downloadExportResponse(response, '광고캠페인.xlsx');
}

/** Convert the selected chart series on the authenticated server. */
export async function exportTrendXlsx(input: AdTrendExportRequest): Promise<void> {
  const response = await apiClient.fetchRaw('/api/ads/exports/trend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  await downloadExportResponse(response, `광고-성과그래프-${input.period}.xlsx`);
}

async function downloadExportResponse(
  response: Response,
  fallbackFileName: string,
): Promise<void> {
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const fileName =
    fileNameFromContentDisposition(response.headers.get('Content-Disposition')) ??
    fallbackFileName;
  downloadBlob(await response.blob(), fileName);
}

async function readErrorMessage(response: Response): Promise<string> {
  const body = (await response.clone().json().catch(() => null)) as {
    message?: unknown;
  } | null;
  return typeof body?.message === 'string'
    ? body.message
    : `엑셀 내보내기에 실패했습니다 (${response.status}).`;
}

function fileNameFromContentDisposition(value: string | null): string | null {
  if (!value) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return /filename="([^"]+)"/i.exec(value)?.[1] ?? null;
}
