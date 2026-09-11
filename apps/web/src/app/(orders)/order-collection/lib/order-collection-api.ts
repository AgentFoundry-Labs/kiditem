import * as XLSX from 'xlsx';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';
import type { OrderCollectionExtensionRun } from './order-collection-extension';
import { fileNameFromContentDisposition } from './order-collection-conversion-response';

export interface OrderCollectionConversionResult {
  fileName: string;
  blob: Blob;
  previewRows: string[][];
  sourceRows: number | null;
  productRows: number | null;
  outputRows: number | null;
  skippedRows: number | null;
  importRunId?: string | null;
  reconciledRows?: number | null;
  rocketWorkbookExportId?: string | null;
  transmissionIntentKey?: string | null;
}

export interface BrowserOrderRowsPayload {
  headers: string[];
  rows: string[][];
  fileName?: string;
}

export interface IcecreamOrderCollectionContinuation {
  mallKey: 'icecream-mall';
  headers: string[];
  originalRows: string[][];
  selectedRows: string[][];
  selectedRowKeys: string[];
  selectionMode: 'manual' | 'automatic';
  sourceRows: number;
}

/**
 * Regenerates a transient workbook from a completed source owner artifact.
 * Converted bytes are deliberately not part of the owner response; this
 * scoped read is the explicit UI download/reopen path.
 */
export async function regenerateOrderCollectionSource(
  run: OrderCollectionExtensionRun,
  options?: { download?: boolean },
): Promise<OrderCollectionConversionResult> {
  const response = await apiClient.fetchRaw(
    `/api/orders/collection/attempts/${encodeURIComponent(run.attemptId)}/convert`,
    {
      method: 'POST',
      headers: {
        'x-source-attempt-token': run.attemptToken,
      },
    },
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const blob = await response.blob();
  const fileName =
    fileNameFromContentDisposition(response.headers.get('Content-Disposition')) ??
    '주문수집_셀피아변환.xls';
  if (options?.download !== false) downloadBlob(blob, fileName);
  return {
    fileName,
    blob,
    previewRows: await readPreviewRows(blob),
    sourceRows: numericHeader(response, 'X-Order-Collection-Source-Rows'),
    productRows: numericHeader(response, 'X-Order-Collection-Product-Rows'),
    outputRows: numericHeader(response, 'X-Order-Collection-Output-Rows'),
    skippedRows: numericHeader(response, 'X-Order-Collection-Skipped-Rows'),
    importRunId: response.headers.get('X-Order-Collection-Import-Run-Id'),
  };
}

/**
 * Reads the owner-retained Icecream capture metadata needed by the web-only
 * delivery-index and automatic-seen consumers. This is intentionally a
 * separate scoped read: the extension page response never carries provider
 * rows or raw source evidence.
 */
export async function readOrderCollectionContinuation(
  run: OrderCollectionExtensionRun,
): Promise<IcecreamOrderCollectionContinuation> {
  const response = await apiClient.fetchRaw(
    `/api/orders/collection/attempts/${encodeURIComponent(run.attemptId)}/continuation`,
    {
      method: 'GET',
      headers: {
        'x-source-attempt-token': run.attemptToken,
      },
    },
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as IcecreamOrderCollectionContinuation;
}

/** 도매꾹 주문 CSV(EUC-KR) 업로드 → 셀피아 .xls 변환. date 주면 그날 주문만. */
export async function convertDomeggookOrderFile(
  file: File,
  options?: { date?: string; download?: boolean; run?: OrderCollectionExtensionRun },
): Promise<OrderCollectionConversionResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.date) formData.append('date', options.date);

  const response = await apiClient.fetchRaw('/api/orders/collection/domeggook/convert', {
    method: 'POST',
    body: formData,
    headers: options?.run ? {
      'x-order-collection-attempt-id': options.run.attemptId,
      'x-source-attempt-token': options.run.attemptToken,
    } : undefined,
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const blob = await response.blob();
  const fileName =
    fileNameFromContentDisposition(response.headers.get('Content-Disposition')) ??
    '도매꾹_셀피아변환.xls';
  if (options?.download !== false) downloadBlob(blob, fileName);

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

/** 롯데ON/GS샵처럼 몰에서 받은 xlsx 를 그대로 업로드 → 셀피아 .xls 변환 (컬럼 재배치 없음, 포맷만 변환). */
export async function convertGsshopOrderFile(
  file: File,
  options?: { download?: boolean; run?: OrderCollectionExtensionRun },
): Promise<OrderCollectionConversionResult> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.fetchRaw('/api/orders/collection/gsshop/convert', {
    method: 'POST',
    body: formData,
    headers: options?.run ? {
      'x-order-collection-attempt-id': options.run.attemptId,
      'x-source-attempt-token': options.run.attemptToken,
    } : undefined,
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const blob = await response.blob();
  const fileName =
    fileNameFromContentDisposition(response.headers.get('Content-Disposition')) ?? 'GS샵_셀피아변환.xls';
  if (options?.download !== false) downloadBlob(blob, fileName);

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

const OUTPUT_FILE_SUFFIX = '_아이스크림몰_변환';

export async function convertIcecreamMallOrderFile(
  file: File,
  password?: string,
  run?: OrderCollectionExtensionRun,
): Promise<OrderCollectionConversionResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (password) formData.append('password', password);

  const response = await apiClient.fetchRaw('/api/orders/collection/icecream-mall/convert', {
    method: 'POST',
    body: formData,
    headers: run ? {
      'x-order-collection-attempt-id': run.attemptId,
      'x-source-attempt-token': run.attemptToken,
    } : undefined,
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
  options?: { download?: boolean; run?: OrderCollectionExtensionRun },
): Promise<OrderCollectionConversionResult> {
  const response = await apiClient.fetchRaw('/api/orders/collection/icecream-mall/convert-rows', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.run ? {
        'x-order-collection-attempt-id': options.run.attemptId,
        'x-source-attempt-token': options.run.attemptToken,
      } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const blob = await response.blob();
  const fileName =
    fileNameFromContentDisposition(response.headers.get('Content-Disposition')) ??
    fallbackFileName(payload.fileName ?? '아이스크림몰_브라우저수집');
  // 자동 감지 등 백그라운드 변환은 파일 자동 다운로드를 끈다 (download: false).
  if (options?.download !== false) {
    downloadBlob(blob, fileName);
  }

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
