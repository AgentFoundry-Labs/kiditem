import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { downloadBlob } from '@/lib/browser-download';

export type FinanceReportType =
  | 'full'
  | 'products'
  | 'profitloss'
  | 'inventory'
  | 'ads';
export type FinanceReportSurface = 'settings' | 'reports';
export type ProfitLossFilter = 'all' | 'minus' | 'low' | 'normal';
export type ProfitLossSortField =
  | 'revenue'
  | 'cogs'
  | 'commission'
  | 'shippingCost'
  | 'adCost'
  | 'otherCost'
  | 'netProfit'
  | 'profitRate';

const FINANCE_REPORT_TYPES: readonly FinanceReportType[] = [
  'full',
  'products',
  'profitloss',
  'inventory',
  'ads',
];

export function isFinanceReportType(value: string): value is FinanceReportType {
  return FINANCE_REPORT_TYPES.includes(value as FinanceReportType);
}

export interface FinanceReportDownloadOptions {
  type: FinanceReportType;
  surface: FinanceReportSurface;
  period?: string;
}

export interface ProfitLossDownloadOptions {
  period: string;
  profitFilter?: ProfitLossFilter;
  grades?: string[];
  sortField?: ProfitLossSortField | null;
  sortDirection?: 'asc' | 'desc' | null;
}

export async function downloadFinanceReport(
  options: FinanceReportDownloadOptions,
): Promise<string> {
  const params = new URLSearchParams({
    type: options.type,
    surface: options.surface,
  });
  if (options.period) params.set('period', options.period);
  const fallback = options.surface === 'settings'
    ? settingsFileName(options.type)
    : reportsFileName(options.type, options.period);
  return downloadServerWorkbook(`/api/reports/export?${params}`, fallback);
}

export async function downloadProfitLossReport(
  options: ProfitLossDownloadOptions,
): Promise<string> {
  const params = new URLSearchParams({ period: options.period });
  if (options.profitFilter && options.profitFilter !== 'all') {
    params.set('profitFilter', options.profitFilter);
  }
  if (options.grades && options.grades.length > 0) {
    params.set('grades', options.grades.join(','));
  }
  if (options.sortField && options.sortDirection) {
    params.set('sortField', options.sortField);
    params.set('sortDirection', options.sortDirection);
  }
  return downloadServerWorkbook(
    `/api/profit-loss/export?${params}`,
    `손익표_${options.period}.xlsx`,
  );
}

async function downloadServerWorkbook(
  path: string,
  fallbackFileName: string,
): Promise<string> {
  const response = await apiClient.fetchRaw(path);
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Preserve the HTTP status when the server did not return JSON.
    }
    const record = body as Record<string, unknown> | null;
    const detail = typeof record?.message === 'string'
      ? record.message
      : '엑셀 내보내기에 실패했습니다.';
    throw new ApiError(
      response.status,
      typeof record?.error === 'string' ? record.error : null,
      detail,
    );
  }

  const fileName = fileNameFromContentDisposition(
    response.headers.get('Content-Disposition'),
  ) ?? fallbackFileName;
  downloadBlob(await response.blob(), fileName);
  return fileName;
}

function settingsFileName(type: FinanceReportType): string {
  const date = new Date().toISOString().slice(0, 10);
  return type === 'full'
    ? `KIDITEM_통합리포트_${date}.xlsx`
    : `KIDITEM_${type}_리포트_${date}.xlsx`;
}

function reportsFileName(type: FinanceReportType, period?: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const periodLabel = period || '전체';
  return type === 'full'
    ? `통합리포트_${periodLabel}_${date}.xlsx`
    : `${type}_리포트_${periodLabel}_${date}.xlsx`;
}

export function fileNameFromContentDisposition(value: string | null): string | null {
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
