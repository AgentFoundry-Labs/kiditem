import * as XLSX from 'xlsx';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';

export interface OrderCollectionConversionResult {
  fileName: string;
  blob: Blob;
  previewRows: string[][];
  sourceRows: number | null;
  productRows: number | null;
  outputRows: number | null;
  skippedRows: number | null;
}

export interface BrowserOrderRowsPayload {
  headers: string[];
  rows: string[][];
  fileName?: string;
}

const OUTPUT_FILE_SUFFIX = '_아이스크림몰_변환';

export async function convertIcecreamMallOrderFile(
  file: File,
  password?: string,
): Promise<OrderCollectionConversionResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (password) formData.append('password', password);

  const response = await apiClient.fetchRaw('/api/orders/collection/icecream-mall/convert', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const blob = await response.blob();
  const fileName =
    fileNameFromContentDisposition(response.headers.get('Content-Disposition')) ??
    fallbackFileName(file.name);
  downloadBlob(blob, fileName);

  return {
    fileName,
    blob,
    previewRows: await readPreviewRows(blob),
    sourceRows: numericHeader(response, 'X-Order-Collection-Source-Rows'),
    productRows: numericHeader(response, 'X-Order-Collection-Product-Rows'),
    outputRows: numericHeader(response, 'X-Order-Collection-Output-Rows'),
    skippedRows: numericHeader(response, 'X-Order-Collection-Skipped-Rows'),
  };
}

export async function convertIcecreamMallOrderRows(
  payload: BrowserOrderRowsPayload,
): Promise<OrderCollectionConversionResult> {
  const response = await apiClient.fetchRaw('/api/orders/collection/icecream-mall/convert-rows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const blob = await response.blob();
  const fileName =
    fileNameFromContentDisposition(response.headers.get('Content-Disposition')) ??
    fallbackFileName(payload.fileName ?? '아이스크림몰_브라우저수집');
  downloadBlob(blob, fileName);

  return {
    fileName,
    blob,
    previewRows: await readPreviewRows(blob),
    sourceRows: numericHeader(response, 'X-Order-Collection-Source-Rows'),
    productRows: numericHeader(response, 'X-Order-Collection-Product-Rows'),
    outputRows: numericHeader(response, 'X-Order-Collection-Output-Rows'),
    skippedRows: numericHeader(response, 'X-Order-Collection-Skipped-Rows'),
  };
}

export function downloadOrderCollectionFile(result: OrderCollectionConversionResult): void {
  downloadBlob(result.blob, result.fileName);
}

async function readErrorMessage(response: Response): Promise<string> {
  const body = (await response.clone().json().catch(() => null)) as { message?: unknown } | null;
  if (typeof body?.message === 'string') return body.message;
  return `변환 실패 (${response.status})`;
}

function numericHeader(response: Response, name: string): number | null {
  const value = response.headers.get(name);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function fallbackFileName(inputName: string): string {
  const baseName = inputName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_');
  return `${withSingleOutputSuffix(baseName || '주문수집')}.xls`;
}

function withSingleOutputSuffix(value: string): string {
  let base = value;
  while (base.endsWith(`${OUTPUT_FILE_SUFFIX}${OUTPUT_FILE_SUFFIX}`)) {
    base = base.slice(0, -OUTPUT_FILE_SUFFIX.length);
  }
  return base.endsWith(OUTPUT_FILE_SUFFIX) ? base : `${base}${OUTPUT_FILE_SUFFIX}`;
}

async function readPreviewRows(blob: Blob): Promise<string[][]> {
  const workbook = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets.deliveryMgmt1 ?? workbook.Sheets[workbook.SheetNames[0] ?? ''];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null | undefined>>(
    sheet,
    {
      header: 1,
      raw: false,
      defval: '',
    },
  );

  return rows.slice(0, 24).map((row) => row.slice(0, 47).map((cell) => String(cell ?? '')));
}
