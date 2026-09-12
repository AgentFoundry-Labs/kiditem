import { apiClient } from '@/lib/api-client';
import type {
  RocketPoCatalogRow,
  RocketWorkbookExportResponse,
} from '@kiditem/shared/rocket-purchase-preview';

const WORKBOOK_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface RocketConfirmationWorkbookResult {
  blob: Blob;
  fileName: string;
  summary: {
    totalRows: number;
    workbookQuantity: number;
    fullyConfirmedRows: number;
    shortRows: number;
  };
}

type RocketConfirmationWorkbookRows = RocketWorkbookExportResponse['rows'];

export function buildRocketConfirmationWorkbook(input: {
  sourceRows: RocketPoCatalogRow[];
  workbookRows: RocketConfirmationWorkbookRows;
  now?: Date;
}): Promise<RocketConfirmationWorkbookResult> {
  return convertRocketConfirmationWorkbook({
    sourceRows: input.sourceRows,
    workbookRows: input.workbookRows,
    now: input.now,
    fallbackFileName: `쿠팡_로켓_${calendarStamp(input.now ?? new Date())}.xlsx`,
  });
}

export function fillRocketConfirmationWorkbook(input: {
  template: ArrayBuffer;
  templateFileName: string;
  sourceRows: RocketPoCatalogRow[];
  workbookRows: RocketConfirmationWorkbookRows;
  now?: Date;
}): Promise<RocketConfirmationWorkbookResult> {
  return convertRocketConfirmationWorkbook({
    sourceRows: input.sourceRows,
    workbookRows: input.workbookRows,
    now: input.now,
    template: input.template,
    templateFileName: input.templateFileName,
    fallbackFileName: `${templateFileStem(input.templateFileName)}_쿠팡제출_${calendarStamp(input.now ?? new Date())}.xlsx`,
  });
}

async function convertRocketConfirmationWorkbook(input: {
  sourceRows: RocketPoCatalogRow[];
  workbookRows: RocketConfirmationWorkbookRows;
  now?: Date;
  template?: ArrayBuffer;
  templateFileName?: string;
  fallbackFileName: string;
}): Promise<RocketConfirmationWorkbookResult> {
  const formData = new FormData();
  formData.set('action', 'convertRocketConfirmationWorkbook');
  formData.set('requestJson', JSON.stringify({
    sourceRows: input.sourceRows,
    workbookRows: input.workbookRows,
    ...(input.now && { now: input.now.toISOString() }),
  }));
  if (input.template !== undefined) {
    formData.set(
      'workbook',
      new Blob([input.template], { type: WORKBOOK_CONTENT_TYPE }),
      input.templateFileName,
    );
  }

  const response = await apiClient.fetchRaw('/api/purchase-orders', {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const body = (await response.clone().json().catch(() => null)) as {
      message?: unknown;
    } | null;
    throw new Error(
      typeof body?.message === 'string'
        ? body.message
        : `Rocket workbook conversion failed (${response.status}).`,
    );
  }

  const blob = await response.blob();
  return {
    blob,
    fileName: responseFileName(response) ?? input.fallbackFileName,
    summary: {
      totalRows: responseNumberHeader(response, 'X-Rocket-Workbook-Total-Rows')
        ?? input.sourceRows.length,
      workbookQuantity: responseNumberHeader(response, 'X-Rocket-Workbook-Quantity')
        ?? input.workbookRows.reduce((total, row) => total + row.workbookQuantity, 0),
      fullyConfirmedRows: responseNumberHeader(response, 'X-Rocket-Workbook-Fully-Confirmed-Rows')
        ?? input.sourceRows.filter((source) => (
          input.workbookRows.find((row) => row.poLineId === source.poLineId)?.workbookQuantity
            ?? 0
        ) >= source.orderQty).length,
      shortRows: responseNumberHeader(response, 'X-Rocket-Workbook-Short-Rows')
        ?? input.sourceRows.filter((source) => (
          input.workbookRows.find((row) => row.poLineId === source.poLineId)?.workbookQuantity
            ?? 0
        ) < source.orderQty).length,
    },
  };
}

function responseFileName(response: Response): string | null {
  const disposition = response.headers.get('Content-Disposition');
  if (!disposition) return null;
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? null;
}

function responseNumberHeader(response: Response, name: string): number | null {
  const value = response.headers.get(name);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function templateFileStem(fileName: string): string {
  const stem = fileName.replace(/\.xlsx$/i, '') || '쿠팡_원본';
  return stem.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_');
}

function calendarStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}
