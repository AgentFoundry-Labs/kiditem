import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';

export type RocketPoStatusCode = 'RP' | 'PA' | 'RI' | 'CI' | '';

export interface RocketConfirmSourceRow {
  poNumber: string;
  barcode: string;
  orderQty: number;
  businessDateBasis?: 'ordered_at' | 'expected_inbound';
  [key: string]: unknown;
}

interface CollectResponse {
  success?: boolean;
  rows?: RocketConfirmSourceRow[];
  poCount?: number;
  error?: string;
  pendingLogin?: boolean;
}

export async function detectRocketOrderExtensionId(requiredCapability: string): Promise<string> {
  const exactId = await detectOrderCollectionExtensionId(1200, requiredCapability);
  if (exactId) return exactId;

  const compatibleId = await detectOrderCollectionExtensionId();
  if (compatibleId) return compatibleId;

  throw new Error(
    '주문수집 확장프로그램을 찾지 못했습니다. extensions/order-collector 를 Chrome 에 로드/새로고침하고 supplier.coupang.com 로그인 후 다시 시도해주세요.',
  );
}

export async function collectRocketPoRowsFromExtension({
  from,
  to,
  status = 'RP',
  dateType = 'WAREHOUSING_PLAN_DATE',
}: {
  from: string;
  to: string;
  status?: RocketPoStatusCode;
  dateType?: 'WAREHOUSING_PLAN_DATE' | 'PURCHASE_ORDER_DATE';
}): Promise<{ rows: RocketConfirmSourceRow[]; poCount: number }> {
  const extensionId = await detectRocketOrderExtensionId('collectRocketPoRows');
  const res = await sendToExtension<CollectResponse>(
    extensionId,
    { action: 'collectRocketPoRows', from, to, status, dateType },
    190000,
  );
  if (!res) {
    throw new Error(
      '주문수집 확장이 로켓 발주 수집 액션에 응답하지 않았습니다. Chrome 확장 관리에서 extensions/order-collector 를 새로고침해주세요.',
    );
  }
  if (!res.success || !res.rows) {
    throw Object.assign(new Error(res.error ?? '로켓 발주 수집에 실패했습니다.'), {
      pendingLogin: res.pendingLogin === true,
    });
  }
  return { rows: res.rows, poCount: res.poCount ?? 0 };
}
