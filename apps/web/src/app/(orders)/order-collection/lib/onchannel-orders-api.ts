import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { apiClient } from '@/lib/api-client';
import type { OrderCollectionConversionResult } from './order-collection-api';
import { conversionResultFrom } from './order-collection-conversion-response';
import {
  orderCollectionExtensionRunFields,
  type OrderCollectionExtensionRun,
} from './order-collection-extension';

export interface OnchannelOrder {
  orderCode?: string;
  date?: string;
  productName?: string;
  productCode?: string;
  option?: string;
  qty?: number;
  productPrice?: number;
  shippingFee?: number;
  customer?: string;
  phone?: string;
  emergency?: string;
  zip?: string;
  address?: string;
  message?: string;
}

interface OnchannelCollectResponse {
  success?: boolean;
  orders?: OnchannelOrder[];
  count?: number;
  error?: string;
}

/**
 * order-collector 확장으로 온채널(onch3.co.kr) 입점관리자 주문 목록을 로그인 세션에서 가져온다.
 * 리스트(주문코드+일자) 스크랩 + 주문별 상세모달(order_detail_supplier) fetch → 상품금액/배송비 분리값 포함.
 */
export async function collectOnchannelOrdersFromExtension(date?: string, run?: OrderCollectionExtensionRun): Promise<OnchannelOrder[]> {
  const extensionId = run?.extensionId ?? await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/kiditem-os 를 Chrome 에 로드하고 onch3.co.kr 입점관리자에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<OnchannelCollectResponse>(
    extensionId,
    {
      action: 'collectOnchannelOrders',
      date,
      // attemptId/deferTerminal: true are included by shared fenced run fields.
      ...orderCollectionExtensionRunFields(run),
    }, // "YYYY-MM-DD" 면 그날 주문만
    130000,
  );
  if (!res?.success || !Array.isArray(res.orders)) {
    throw new Error(res?.error ?? '온채널 주문 수집에 실패했습니다.');
  }
  return res.orders;
}

/** 수집한 온채널 주문(orders[])을 셀피아 업로드 양식(.xls)으로 변환. 생성 파일 목록 등록용 결과 반환. */
export async function convertOnchannelToSellpiaFile(
  orders: OnchannelOrder[],
  options?: { download?: boolean; run?: OrderCollectionExtensionRun },
): Promise<OrderCollectionConversionResult> {
  const res = await apiClient.fetchRaw('/api/orders/collection/onchannel/convert', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options?.run ? {
        'x-order-collection-attempt-id': options.run.attemptId,
        'x-source-attempt-token': options.run.attemptToken,
      } : {}),
    },
    body: JSON.stringify({ orders }),
  });
  if (!res.ok) {
    throw new Error((await res.text().catch(() => '')) || '온채널 변환에 실패했습니다.');
  }
  return conversionResultFrom(res, {
    defaultFileName: '온채널_셀피아변환.xls',
    preview: { xlsxColumns: 16 },
    download: options?.download,
  });
}
