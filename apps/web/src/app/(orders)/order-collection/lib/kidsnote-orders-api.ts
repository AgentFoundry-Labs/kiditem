import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { apiClient } from '@/lib/api-client';
import type { OrderCollectionConversionResult } from './order-collection-api';
import { conversionResultFrom } from './order-collection-conversion-response';
import {
  orderCollectionExtensionRunFields,
  type OrderCollectionExtensionRun,
} from './order-collection-extension';

export interface KidsnoteOrderItem {
  productName: string;
  option?: string;
  qty?: number;
  amount?: number; // 상품총액
  shipFee?: number;
}

/** KidsNote(WISA) 전체주문조회(body=3010) 한 행 = 정규화된 주문 (+상세). */
export interface KidsnoteOrder {
  ono: string; // 주문번호 (YYYYMMDD-XXXXX)
  orderDate: string; // YYYY-MM-DD (주문번호 접두에서 추출)
  orderedAt: string; // YYYY-MM-DD HH:MM:SS
  productName: string; // 주문상품 (대표, 리스트)
  ordererName: string; // 주문자 (리스트)
  totalAmount: number; // 총주문액
  paidAmount: number; // 실결제
  payMethod: string; // 결제방법
  status: string; // 상태 (예: "배송중(1)")
  // 상세(withDetail) — 셀피아 변환용
  paidAt?: string; // 입금일시
  receiver?: string; // 수취인
  mobile?: string; // 수취인 휴대폰
  tel?: string; // 전화
  zip?: string; // 우편번호
  address?: string; // 배송지
  request?: string; // 배송요청사항
  items?: KidsnoteOrderItem[]; // 품목(제품명/수량/옵션/배송비)
}

interface CollectResponse {
  success?: boolean;
  orders?: KidsnoteOrder[];
  count?: number;
  error?: string;
}

/**
 * order-collector 확장으로 KidsNote 관리자 전체주문조회를 로그인 세션에서 수집.
 * withDetail=true 면 각 주문 상세(수취인/연락처/주소/품목)까지 — 셀피아 변환용(느림).
 */
export async function collectKidsnoteOrdersFromExtension(
  from: string,
  to: string,
  status = '',
  withDetail = false,
  run?: OrderCollectionExtensionRun,
): Promise<{ orders: KidsnoteOrder[]; count: number }> {
  const extensionId = run?.extensionId ?? await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/kiditem-os 를 Chrome 에 로드하고 shop.kidsnote.com 관리자에 로그인한 뒤 다시 시도하세요.',
    );
  }
  const res = await sendToExtension<CollectResponse>(
    extensionId,
    {
      action: 'collectKidsnoteOrders',
      from,
      to,
      status,
      withDetail,
      // attemptId/deferTerminal: true are included by shared fenced run fields.
      ...orderCollectionExtensionRunFields(run),
    },
    withDetail ? 200000 : 90000,
  );
  if (!res?.success || !res.orders) {
    throw new Error(res?.error ?? 'KidsNote 주문 수집에 실패했습니다.');
  }
  return { orders: res.orders, count: res.count ?? res.orders.length };
}

/** 수집한 KidsNote 주문(상세 포함)을 셀피아 업로드 양식(.xls)으로 변환. 생성 파일 목록 등록용 결과 반환. */
export async function convertKidsnoteToSellpiaFile(
  orders: KidsnoteOrder[],
  options?: { download?: boolean; run?: OrderCollectionExtensionRun },
): Promise<OrderCollectionConversionResult> {
  const payload = {
    orders: orders.map((o) => ({
      ono: o.ono,
      orderedAt: o.orderedAt,
      paidAt: o.paidAt ?? '',
      buyer: o.ordererName,
      total: o.totalAmount,
      paid: o.paidAmount,
      payMethod: o.payMethod,
      status: o.status,
      receiver: o.receiver || o.ordererName,
      mobile: o.mobile ?? '',
      tel: o.tel ?? '',
      zip: o.zip ?? '',
      address: o.address ?? '',
      request: o.request ?? '',
      items:
        o.items && o.items.length
          ? o.items
          : [{ productName: o.productName, qty: 1, option: '', shipFee: 0 }],
    })),
  };
  const res = await apiClient.fetchRaw('/api/orders/collection/kidsnote/convert', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options?.run ? {
        'x-order-collection-attempt-id': options.run.attemptId,
        'x-source-attempt-token': options.run.attemptToken,
      } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error((await res.text().catch(() => '')) || '셀피아 변환에 실패했습니다.');
  }
  return conversionResultFrom(res, {
    defaultFileName: '키즈노트_셀피아변환.xls',
    preview: { xlsxColumns: 21 },
    download: options?.download,
  });
}
