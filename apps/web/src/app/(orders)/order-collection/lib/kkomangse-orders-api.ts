import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { apiClient } from '@/lib/api-client';
import type { OrderCollectionConversionResult } from './order-collection-api';
import { conversionResultFrom } from './order-collection-conversion-response';
import {
  orderCollectionExtensionRunFields,
  type OrderCollectionExtensionRun,
} from './order-collection-extension';

interface KkomangseCollectResponse {
  success?: boolean;
  xlsxBase64?: string;
  size?: number;
  error?: string;
}

/**
 * order-collector 확장으로 꼬망세(EduPre) 입점관리자 "선택엑셀다운"(검색결과 전체) xlsx 를
 * 로그인 세션에서 가져온다 (base64). HTML 스크랩이 아니라 관리자의 엑셀 export 를 그대로 fetch.
 */
export async function collectKkomangseXlsxFromExtension(run?: OrderCollectionExtensionRun): Promise<string> {
  const extensionId = run?.extensionId ?? await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/kiditem-os 를 Chrome 에 로드하고 nstore.edupre.co.kr 관리자에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<KkomangseCollectResponse>(
    extensionId,
    {
      action: 'collectKkomangseOrders',
      date: run?.date,
      // attemptId/deferTerminal: true are included by shared fenced run fields.
      ...orderCollectionExtensionRunFields(run),
    },
    90000,
  );
  if (!res?.success || !res.xlsxBase64) {
    throw new Error(res?.error ?? '꼬망세 주문 수집에 실패했습니다.');
  }
  return res.xlsxBase64;
}

/** 수집한 꼬망세 xlsx(base64)를 셀피아 업로드 양식(.xls)으로 변환. 생성 파일 목록 등록용 결과 반환. */
export async function convertKkomangseToSellpiaFile(
  xlsxBase64: string,
  options?: { download?: boolean; date?: string; run?: OrderCollectionExtensionRun },
): Promise<OrderCollectionConversionResult> {
  const res = await apiClient.fetchRaw('/api/orders/collection/kkomangse/convert', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options?.run ? {
        'x-order-collection-attempt-id': options.run.attemptId,
        'x-source-attempt-token': options.run.attemptToken,
      } : {}),
    },
    body: JSON.stringify({ xlsxBase64, date: options?.date }),
  });
  if (!res.ok) {
    throw new Error((await res.text().catch(() => '')) || '꼬망세 변환에 실패했습니다.');
  }
  return conversionResultFrom(res, {
    defaultFileName: '꼬망세_셀피아변환.xls',
    preview: { xlsxColumns: 27 },
    download: options?.download,
  });
}
