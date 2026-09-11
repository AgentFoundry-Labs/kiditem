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

interface GsshopCollectResponse extends OrderCollectionFailureResponse {
  empty?: boolean;
  rowCount?: number;
  xlsxBase64?: string;
  fileName?: string;
  size?: number;
  error?: string;
}

/**
 * order-collector 확장이 GS샵 협력사 배송관리 화면에서 1주일(출하지시일) 기간으로 조회 → 다운로드
 * (주소=도로명/전체주소 기본값) 를 자동 실행해 GS가 클라이언트에서 조립한 직송주문 엑셀(.xlsx)을 가져온다.
 * 조회결과가 없으면 empty:true. 확장 서비스워커(MAIN world)가 createObjectURL 후킹으로 blob 캡처.
 */
export async function collectGsshopXlsxFromExtension(run?: OrderCollectionExtensionRun): Promise<
  { xlsxBase64: string; fileName: string } | { empty: true }
> {
  const extensionId = run?.extensionId ?? await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/kiditem-os 를 Chrome 에 로드하고 partners.gsshop.com 에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<GsshopCollectResponse>(
    extensionId,
    {
      action: 'collectGsshopOrders',
      date: run?.date,
      // attemptId/deferTerminal: true are included by shared fenced run fields.
      ...orderCollectionExtensionRunFields(run),
    },
    150000, // GS 는 조회+상세 fetch 후 클라이언트 엑셀 조립이라 넉넉히
  );
  if (res?.success === true && res.empty === true) return { empty: true };
  if (!res?.success || !res.xlsxBase64) {
    throw createOrderCollectionExtensionError(res, 'GS샵 주문 수집에 실패했습니다.');
  }
  return { xlsxBase64: res.xlsxBase64, fileName: res.fileName ?? 'GS샵.xlsx' };
}

/** 수집한 GS샵 xlsx(base64)를 File 로 재구성해 셀피아 .xls 로 변환 (79컬럼 그대로, 포맷만 xlsx→xls). */
export async function convertGsshopToSellpiaFile(
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
  const response = await apiClient.fetchRaw('/api/orders/collection/gsshop/convert', {
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
    defaultFileName: 'GS샵_셀피아변환.xls',
    preview: { xlsxColumns: 79 },
    download: options?.download,
  });
}

