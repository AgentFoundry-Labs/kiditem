import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';
import type { OrderCollectionConversionResult } from './order-collection-api';

interface BoriboriCollectResponse {
  success?: boolean;
  xlsxBase64?: string;
  fileName?: string;
  size?: number;
  error?: string;
}

/**
 * order-collector 확장이 보리보리(seller-club) 출고대기 주문을 "일괄엑셀다운로드"로 언마스킹 다운로드한다.
 * 서버가 다운로드 사유="배송확인합니다"와, 사이트가 요구하는 경우 계정 비밀번호로 언마스킹 xlsx(35컬럼)를 반환한다.
 */
export async function collectBoriboriXlsxFromExtension(options?: {
  password?: string;
}): Promise<{ xlsxBase64: string; fileName: string }> {
  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/order-collector 를 Chrome 에 로드하고 seller-club.co.kr 에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<BoriboriCollectResponse>(
    extensionId,
    { action: 'collectBoriboriOrders', password: options?.password ?? '' },
    130000,
  );
  if (!res?.success || !res.xlsxBase64) {
    throw new Error(res?.error ?? '보리보리 주문 수집에 실패했습니다.');
  }
  return { xlsxBase64: res.xlsxBase64, fileName: res.fileName ?? '보리보리.xlsx' };
}

/** 수집한 보리보리 xlsx(base64)를 File 로 재구성해 셀피아 .xls 로 변환 (35컬럼 그대로, 포맷만 xlsx→xls). */
export async function convertBoriboriToSellpiaFile(
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
  const response = await apiClient.fetchRaw('/api/orders/collection/boribori/convert', {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const body = (await response.clone().json().catch(() => null)) as { message?: unknown } | null;
    throw new Error(typeof body?.message === 'string' ? body.message : `변환 실패 (${response.status})`);
  }

  const blob = await response.blob();
  const outName =
    fileNameFromContentDisposition(response.headers.get('Content-Disposition')) ?? '보리보리_셀피아변환.xls';
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
  return rows.slice(0, 24).map((row) => row.slice(0, 35).map((cell) => String(cell ?? '')));
}
