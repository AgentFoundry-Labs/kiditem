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

interface BoriboriCollectResponse extends OrderCollectionFailureResponse {
  empty?: boolean;
  rowCount?: number;
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
  run?: OrderCollectionExtensionRun;
}): Promise<{ xlsxBase64: string; fileName: string } | { empty: true }> {
  const extensionId = options?.run?.extensionId ?? await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/kiditem-os 를 Chrome 에 로드하고 seller-club.co.kr 에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<BoriboriCollectResponse>(
    extensionId,
    {
      action: 'collectBoriboriOrders',
      date: options?.run?.date,
      password: options?.password ?? '',
      // attemptId/deferTerminal: true are included by shared fenced run fields.
      ...orderCollectionExtensionRunFields(options?.run),
    },
    130000,
  );
  if (res?.success === true && res.empty === true) return { empty: true };
  if (!res?.success || !res.xlsxBase64) {
    throw createOrderCollectionExtensionError(res, '보리보리 주문 수집에 실패했습니다.');
  }
  return { xlsxBase64: res.xlsxBase64, fileName: res.fileName ?? '보리보리.xlsx' };
}

/** 수집한 보리보리 xlsx(base64)를 File 로 재구성해 셀피아 .xls 로 변환 (35컬럼 그대로, 포맷만 xlsx→xls). */
export async function convertBoriboriToSellpiaFile(
  xlsxBase64: string,
  fileName: string,
  options?: { download?: boolean; run?: OrderCollectionExtensionRun },
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
    defaultFileName: '보리보리_셀피아변환.xls',
    preview: { xlsxColumns: 35 },
    download: options?.download,
  });
}

