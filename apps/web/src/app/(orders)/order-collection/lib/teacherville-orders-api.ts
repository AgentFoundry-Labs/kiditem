import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { apiClient } from '@/lib/api-client';
import type { OrderCollectionConversionResult } from './order-collection-api';
import { conversionResultFrom } from './order-collection-conversion-response';
import {
  createOrderCollectionExtensionError,
  orderCollectionExtensionRunFields,
  type OrderCollectionExtensionRun,
  type OrderCollectionFailureResponse,
} from './order-collection-extension';

interface TeachervilleCollectResponse extends OrderCollectionFailureResponse {
  empty?: boolean;
  rowCount?: number;
  xlsxBase64?: string;
  fileName?: string;
  size?: number;
  error?: string;
}

/**
 * order-collector 확장이 티쳐몰(퍼스트몰 selleradmin) 출고 전 주문을 셀피아 양식(엑셀 템플릿 117 "티쳐몰 주문서")
 * 으로 다운로드한다. order_process/excel_down 페이지-fetch → SpreadsheetML(36컬럼) base64 반환.
 */
export async function collectTeachervilleXlsxFromExtension(
  run?: OrderCollectionExtensionRun,
): Promise<{ xlsxBase64: string; fileName: string } | { empty: true }> {
  const extensionId = run?.extensionId ?? await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/kiditem-os 를 Chrome 에 로드하고 shop.teacherville.co.kr 에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<TeachervilleCollectResponse>(
    extensionId,
    {
      action: 'collectTeachervilleOrders',
      date: run?.date,
      // attemptId/deferTerminal: true are included by shared fenced run fields.
      ...orderCollectionExtensionRunFields(run),
    },
    130000,
  );
  if (res?.success === true && res.empty === true) return { empty: true };
  if (!res?.success || !res.xlsxBase64) {
    throw createOrderCollectionExtensionError(res, '티쳐몰 주문 수집에 실패했습니다.');
  }
  return { xlsxBase64: res.xlsxBase64, fileName: res.fileName ?? '티쳐몰.xls' };
}

/** 수집한 티쳐몰 엑셀(base64)을 File 로 재구성해 셀피아 .xls 로 변환 (36컬럼 passthrough, 포맷만 SpreadsheetML→xls). */
export async function convertTeachervilleToSellpiaFile(
  xlsxBase64: string,
  fileName: string,
  options?: { download?: boolean; run?: OrderCollectionExtensionRun },
): Promise<OrderCollectionConversionResult> {
  const bin = atob(xlsxBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const file = new File([bytes], fileName, { type: 'application/vnd.ms-excel' });

  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.fetchRaw('/api/orders/collection/teacherville/convert', {
    method: 'POST',
    body: formData,
    headers: options?.run ? {
      'x-order-collection-attempt-id': options.run.attemptId,
      'x-source-attempt-token': options.run.attemptToken,
    } : undefined,
  });
  if (!response.ok) {
    const body = (await response.clone().json().catch(() => null)) as { message?: unknown } | null;
    throw new Error(typeof body?.message === 'string' ? body.message : `변환 실패 (${response.status})`);
  }

  return conversionResultFrom(response, {
    defaultFileName: '티쳐몰_셀피아변환.xls',
    preview: { xlsxColumns: 36 },
    download: options?.download,
  });
}

