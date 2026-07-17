import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';

export interface RocketPoSummary {
  poSeq: number;
  orderedAt: string;
  eta: string;
  status: string;
  vendorName: string;
  centerName: string;
  inboundType: string;
  firstSkuName: string;
  skuCount: number;
  orderQty: number;
  orderAmount: number;
}

const ROCKET_STATUS_CODE: Record<string, string> = {
  거래처확인요청: 'RP',
  발주확정: 'PA',
  거래명세서확인요청: 'RI',
  거래명세서확인: 'CI',
};

/** Read-only PO summary collection through the operator's authenticated extension. */
export async function listRocketPosFromExtension(
  from: string,
  to: string,
  status = '',
): Promise<RocketPoSummary[]> {
  const extensionId = await detectOrderCollectionExtensionId(1200, 'listRocketPos');
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/order-collector 를 Chrome 에 로드하고 supplier.coupang.com 에 로그인한 뒤 다시 시도해주세요.',
    );
  }
  const statusCode = status ? ROCKET_STATUS_CODE[status] ?? '' : '';
  const response = await sendToExtension<{
    success?: boolean;
    pos?: RocketPoSummary[];
    error?: string;
  }>(
    extensionId,
    {
      action: 'listRocketPos',
      from,
      to,
      status: statusCode,
      runId: globalThis.crypto.randomUUID(),
    },
    70_000,
  );
  if (!response?.success || !response.pos) {
    throw new Error(response?.error ?? '로켓 발주 목록 조회에 실패했습니다.');
  }
  return response.pos;
}
