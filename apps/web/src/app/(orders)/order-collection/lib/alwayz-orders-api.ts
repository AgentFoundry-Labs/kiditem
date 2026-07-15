import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';
import type { OrderCollectionConversionResult } from './order-collection-api';
import type { OrderCollectionExtensionRun } from './order-collection-extension';

interface AlwayzCollectResponse {
  success?: boolean;
  empty?: boolean;
  xlsxBase64?: string;
  fileName?: string;
  size?: number;
  error?: string;
}

/**
 * order-collector 확장이 올웨이즈 판매자센터(alwayzseller.ilevit.com/shippings)의 "팀모집완료(엑셀추출 이전)"
 * 를 "엑셀추출하기"로 자동 실행해, 앱이 클라이언트에서 조립한 주문 엑셀(.xlsx)을 가져온다.
 * 신규 주문이 없으면 empty:true. 확장 서비스워커(MAIN world)가 createObjectURL 후킹으로 blob 캡처.
 */
export async function collectAlwayzXlsxFromExtension(run?: OrderCollectionExtensionRun): Promise<
  { xlsxBase64: string; fileName: string } | { empty: true }
> {
  const extensionId = run?.extensionId ?? await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/order-collector 를 Chrome 에 로드하고 alwayzseller.ilevit.com 에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<AlwayzCollectResponse>(
    extensionId,
    {
      action: 'collectAlwayzOrders',
      date: run?.date,
      runId: run?.runId ?? globalThis.crypto.randomUUID(),
    },
    130000, // 엑셀추출(클라이언트 조립)이라 넉넉히
  );
  if (res?.empty) return { empty: true };
  if (!res?.success || !res.xlsxBase64) {
    throw new Error(res?.error ?? '올웨이즈 주문 수집에 실패했습니다.');
  }
  return { xlsxBase64: res.xlsxBase64, fileName: res.fileName ?? '올웨이즈.xlsx' };
}

/** 수집한 올웨이즈 xlsx(base64)를 File 로 재구성해 셀피아 .xls 로 변환 (26컬럼 그대로, 포맷만 xlsx→xls). */
export async function convertAlwayzToSellpiaFile(
  xlsxBase64: string,
  fileName: string,
  options?: { download?: boolean },
): Promise<OrderCollectionConversionResult> {
  const bin = atob(xlsxBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const file = new File([bytes], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.fetchRaw('/api/orders/collection/alwayz/convert', {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const body = (await response.clone().json().catch(() => null)) as { message?: unknown } | null;
    throw new Error(typeof body?.message === 'string' ? body.message : `변환 실패 (${response.status})`);
  }

  const blob = await response.blob();
  const outName =
    fileNameFromContentDisposition(response.headers.get('Content-Disposition')) ?? '올웨이즈_셀피아변환.xls';
  if (options?.download !== false) downloadBlob(blob, outName);

  return {
    fileName: outName,
    blob,
    previewRows: await readPreviewRows(blob),
    sourceRows: numericHeader(response, 'X-Order-Collection-Source-Rows'),
    productRows: numericHeader(response, 'X-Order-Collection-Product-Rows'),
    outputRows: numericHeader(response, 'X-Order-Collection-Output-Rows'),
    skippedRows: numericHeader(response, 'X-Order-Collection-Skipped-Rows'),
  };
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

async function readPreviewRows(blob: Blob): Promise<string[][]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null | undefined>>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  return rows.slice(0, 24).map((row) => row.slice(0, 26).map((cell) => String(cell ?? '')));
}
