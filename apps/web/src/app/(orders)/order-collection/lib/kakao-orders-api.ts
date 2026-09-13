import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import {
  orderCollectionExtensionRunFields,
  type OrderCollectionExtensionRun,
} from './order-collection-extension';

/** 카카오(톡스토어) OMS `_search` 응답 한 건 (배송준비중 statusCode 301). 확장이 raw 그대로 넘긴다. */
export interface KakaoOrder {
  statusCode?: number;
  statusName?: string;
  paymentId?: number | string;
  itemId?: number | string;
  itemName?: string;
  optionTitle?: string;
  quantity?: number;
  receiverName?: string;
  receiverMobileNumber?: string;
  address?: string;
  zoneCode?: string;
  [key: string]: unknown;
}

interface KakaoCollectResponse {
  success?: boolean;
  orders?: KakaoOrder[];
  count?: number;
  error?: string;
  pendingLogin?: boolean;
}

/**
 * order-collector 확장으로 카카오쇼핑 판매자센터(shopping-seller.kakao.com) 주문을 로그인 세션에서 가져온다.
 * ⭐OMS `_search` API 스크랩 — 다운로드 없이 배송준비중(301)만, PII 언마스킹된 상태로 반환.
 */
export async function collectKakaoOrdersFromExtension(date?: string, run?: OrderCollectionExtensionRun): Promise<KakaoOrder[]> {
  const extensionId = run?.extensionId ?? await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/kiditem-os 를 Chrome 에 로드하고 shopping-seller.kakao.com 에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<KakaoCollectResponse>(
    extensionId,
    {
      action: 'collectKakaoOrders',
      date: date ?? run?.date,
      // attemptId/deferTerminal: true are included by shared fenced run fields.
      ...orderCollectionExtensionRunFields(run),
    }, // "YYYY-MM-DD" 면 그날 결제분만
    130000,
  );
  if (!res?.success || !Array.isArray(res.orders)) {
    throw Object.assign(new Error(res?.error ?? '카카오 주문 수집에 실패했습니다.'), {
      pendingLogin: res?.pendingLogin === true,
    });
  }
  return res.orders;
}

/**
 * Kakao has no validated Sellpia field mapping. Keep the raw provider rows on
 * the fenced owner failure for later inspection; never invent a conversion.
 */
export function throwKakaoConversionUnsupported(orders: KakaoOrder[]): never {
  const error = new Error('카카오는 셀피아 변환 규격이 검증되지 않아 지원하지 않습니다.');
  Object.assign(error, {
    code: 'UNSUPPORTED_CONVERSION',
    sourcePayload: orders,
  });
  throw error;
}
