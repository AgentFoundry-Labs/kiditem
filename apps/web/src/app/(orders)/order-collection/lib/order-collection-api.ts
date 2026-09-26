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
  if (response.status !== 204 && options?.download !== false) downloadBlob(blob, fileName);
  return {
    fileName,
    blob,
    previewRows: response.status === 204 ? [] : await readPreviewRows(blob),
    sourceRows: numericHeader(response, 'X-Order-Collection-Source-Rows'),
    productRows: numericHeader(response, 'X-Order-Collection-Product-Rows'),
    outputRows: numericHeader(response, 'X-Order-Collection-Output-Rows'),
    skippedRows: numericHeader(response, 'X-Order-Collection-Skipped-Rows'),
    importRunId: response.headers.get('X-Order-Collection-Import-Run-Id'),
  };
}

/**
 * 실행 kind(`orders.mall_orders`, KID-359 H3)로 수집한 몰: 성공한 실행의 보관 캡처를 서버가 다시 변환한다. 경로의
 * id와 본문의 `operationId`가 같은 실행이다. 주문이 없던 수집은 204(파일 없음).
 */
export async function regenerateOrderOperationSource(
  operationId: string,
  options?: { download?: boolean },
): Promise<OrderCollectionConversionResult> {
  const response = await apiClient.fetchRaw(
    `/api/orders/collection/attempts/${encodeURIComponent(operationId)}/convert`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationId }),
    },
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const blob = await response.blob();
  const fileName =
    fileNameFromContentDisposition(response.headers.get('Content-Disposition')) ??
    '주문수집_셀피아변환.xls';
  if (response.status !== 204 && options?.download !== false) downloadBlob(blob, fileName);
  return {
    fileName,
    blob,
    previewRows: response.status === 204 ? [] : await readPreviewRows(blob),
    sourceRows: numericHeader(response, 'X-Order-Collection-Source-Rows'),
    productRows: numericHeader(response, 'X-Order-Collection-Product-Rows'),
    outputRows: numericHeader(response, 'X-Order-Collection-Output-Rows'),
    skippedRows: numericHeader(response, 'X-Order-Collection-Skipped-Rows'),
  };
}

/**
 * 아이스크림몰 continuation(배송 색인·다음 자동 선택에 쓰는 원본 행·고른 행 키). 성공한 몰 주문 실행의 보관 캡처에서만
 * 읽는다(KID-359 H3) — 경로 id와 query `operationId`가 같은 실행이다. 확장 응답은 원본 행을 싣지 않는다.
 */
export async function readOrderOperationContinuation(
  operationId: string,
): Promise<IcecreamOrderCollectionContinuation> {
  const id = encodeURIComponent(operationId);
  const response = await apiClient.fetchRaw(`/api/orders/collection/attempts/${id}/continuation?operationId=${id}`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as IcecreamOrderCollectionContinuation;
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
