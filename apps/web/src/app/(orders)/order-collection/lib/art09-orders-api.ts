import { apiClient } from '@/lib/api-client';
import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import type { OrderCollectionConversionResult } from './order-collection-api';
import { conversionResultFrom } from './order-collection-conversion-response';
import {
  orderCollectionExtensionRunFields,
  type OrderCollectionExtensionRun,
} from './order-collection-extension';

export interface Art09OrderRow {
  shopName?: string;
  shopNo?: string;
  orderId?: string;
  orderItemId?: string;
  message?: string;
  totalOrderAmount?: string;
  totalPaymentAmount?: string;
  productNo?: string;
  productName?: string;
  productNameWithOption?: string;
  qty?: string | number;
  salePrice?: string;
  receiver?: string;
  receiverPhone?: string;
  receiverZip?: string;
  receiverAddress?: string;
  receiverAddressDetail?: string;
  paymentType?: string;
  paymentMethod?: string;
  orderedAt?: string;
  country?: string;
}

interface Art09CollectResponse {
  success?: boolean;
  rows?: Art09OrderRow[];
  count?: number;
  orderCount?: number;
  error?: string;
}

export async function collectArt09OrdersFromExtension(run?: OrderCollectionExtensionRun): Promise<Art09OrderRow[]> {
  const extensionId = run?.extensionId ?? await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/kiditem-os 를 Chrome 에 로드하고 zzogzzog1.cafe24.com 에 로그인한 뒤 다시 시도하세요.',
    );
  }

  const res = await sendToExtension<Art09CollectResponse>(
    extensionId,
    {
      action: 'collectArt09Orders',
      date: run?.date,
      // attemptId/deferTerminal: true are included by shared fenced run fields.
      ...orderCollectionExtensionRunFields(run),
    },
    190000,
  );

  if (!res?.success || !Array.isArray(res.rows)) {
    throw new Error(res?.error ?? '아트공구 주문 수집에 실패했습니다.');
  }

  return res.rows.filter(isValidArt09OrderRow);
}

/** Server-owned Art09 conversion; the CSV response remains an immediate download. */
export async function convertArt09ToSellpiaFile(
  rows: Art09OrderRow[],
  options?: { download?: boolean; run?: OrderCollectionExtensionRun },
): Promise<OrderCollectionConversionResult> {
  const response = await apiClient.fetchRaw('/api/orders/collection/art09/convert', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options?.run ? {
        'x-order-collection-attempt-id': options.run.attemptId,
        'x-source-attempt-token': options.run.attemptToken,
      } : {}),
    },
    body: JSON.stringify({ rows }),
  });
  if (!response.ok) {
    throw new Error((await response.text().catch(() => '')) || '아트공구 변환에 실패했습니다.');
  }
  return conversionResultFrom(response, {
    defaultFileName: `zzogzzog1_${todayCompact()}_주문수집.csv`,
    preview: { csv: true },
    download: options?.download,
  });
}

function isValidArt09OrderRow(row: Art09OrderRow): boolean {
  const orderId = row.orderId?.trim() ?? '';
  const orderItemId = row.orderItemId?.trim() ?? '';
  const quantity = Number(row.qty);
  return /^\d{8}-\d{7}$/.test(orderId)
    && (!orderItemId || new RegExp(`^${orderId}-\\d{2,}$`).test(orderItemId))
    && Boolean(row.productName?.trim())
    && Number.isFinite(quantity)
    && quantity > 0;
}

function todayCompact(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
