import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';

/** 확장이 supplier.coupang.com 에서 긁어오는 발주 SKU 행 (확정수량/사유는 백엔드에서 계산). */
export interface RocketConfirmSourceRow {
  poNumber: string;
  barcode: string;
  orderQty: number;
  [key: string]: unknown;
}

interface CollectResponse {
  success?: boolean;
  rows?: RocketConfirmSourceRow[];
  poCount?: number;
  error?: string;
}

/** order-collector 확장으로 거래처확인요청 발주 풀컬럼을 supplier 세션에서 수집. */
export async function collectRocketPoRowsFromExtension(
  from: string,
  to: string,
): Promise<{ rows: RocketConfirmSourceRow[]; poCount: number }> {
  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/order-collector 를 Chrome 에 로드하고 supplier.coupang.com 에 로그인한 뒤 다시 시도해주세요.',
    );
  }
  const res = await sendToExtension<CollectResponse>(
    extensionId,
    { action: 'collectRocketPoRows', from, to },
    190000,
  );
  if (!res?.success || !res.rows) {
    throw new Error(res?.error ?? '로켓 발주 수집에 실패했습니다.');
  }
  return { rows: res.rows, poCount: res.poCount ?? 0 };
}

export interface RocketConfirmSummary {
  total: number;
  confirmed: number;
  short: number;
  matched: number;
}

/** 수집한 발주 행을 백엔드로 보내 확정수량/사유 채운 업로드 양식(.xlsx)을 생성·다운로드. */
export async function generateRocketConfirmFile(
  rows: RocketConfirmSourceRow[],
): Promise<RocketConfirmSummary> {
  const res = await apiClient.fetchRaw('/api/orders/rocket/confirm-generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || '양식 생성에 실패했습니다.');
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const fileName = m ? decodeURIComponent(m[1]) : `발주확정_${Date.now()}.xlsx`;
  downloadBlob(blob, fileName);
  return {
    total: Number(res.headers.get('X-Rocket-Total') ?? 0),
    confirmed: Number(res.headers.get('X-Rocket-Confirmed') ?? 0),
    short: Number(res.headers.get('X-Rocket-Short') ?? 0),
    matched: Number(res.headers.get('X-Rocket-Matched') ?? 0),
  };
}
