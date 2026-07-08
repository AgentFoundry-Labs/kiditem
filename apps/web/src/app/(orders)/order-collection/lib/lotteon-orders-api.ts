import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';
import type { OrderCollectionConversionResult } from './order-collection-api';

interface LotteonCollectResponse {
  success?: boolean;
  xlsxBase64?: string;
  fileName?: string;
  size?: number;
  error?: string;
}

/**
 * order-collector 확장이 롯데ON 판매자센터 배송관리 "신규주문" 엑셀을 로그인 세션으로 백그라운드 수집한다.
 * (saveDownloadReason 로 개인정보 다운로드 사유 등록 → downloadDeliveryExcel 로 fileId 발급 → fileManage
 *  CDN 다운로드). 반환은 base64(xlsx bytes 그대로). 확장 서비스워커가 CORS·인증을 우회.
 */
export async function collectLotteonXlsxFromExtension(): Promise<{ xlsxBase64: string; fileName: string }> {
  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/order-collector 를 Chrome 에 로드하고 store.lotteon.com 에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<LotteonCollectResponse>(
    extensionId,
    { action: 'collectLotteonOrders' },
    120000,
  );
  if (!res?.success || !res.xlsxBase64) {
    throw new Error(res?.error ?? '롯데ON 주문 수집에 실패했습니다.');
  }
  return { xlsxBase64: res.xlsxBase64, fileName: res.fileName ?? '롯데ON.xlsx' };
}

/** 수집한 롯데ON xlsx(base64)를 File 로 재구성해 셀피아 .xls 로 변환 (57컬럼 그대로, 포맷만 xlsx→xls). */
export async function convertLotteonToSellpiaFile(
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
  const response = await apiClient.fetchRaw('/api/orders/collection/lotteon/convert', {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const body = (await response.clone().json().catch(() => null)) as { message?: unknown } | null;
    throw new Error(typeof body?.message === 'string' ? body.message : `변환 실패 (${response.status})`);
  }

  const blob = await response.blob();
  const outName =
    fileNameFromContentDisposition(response.headers.get('Content-Disposition')) ?? '롯데ON_셀피아변환.xls';
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
  return rows.slice(0, 24).map((row) => row.slice(0, 57).map((cell) => String(cell ?? '')));
}
