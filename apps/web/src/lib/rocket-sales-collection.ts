import {
  RocketPoCatalogRowSchema,
  RocketPoCollectionEvidenceSchema,
  type RocketPoCatalogRow,
  type RocketPoCollectionEvidence,
} from '@kiditem/shared/rocket-purchase-preview';
import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';

export type RocketPoStatusCode = 'RP' | 'PA' | 'RI' | 'CI' | '';

interface CollectResponse {
  success?: boolean;
  rows?: unknown[];
  poCount?: number;
  evidence?: unknown;
  error?: string;
  pendingLogin?: boolean;
}

export async function detectRocketOrderExtensionId(requiredCapability: string): Promise<string> {
  const exactId = await detectOrderCollectionExtensionId(1200, requiredCapability);
  if (exactId) return exactId;

  const compatibleId = await detectOrderCollectionExtensionId();
  if (compatibleId) {
    throw new Error(
      '주문수집 확장프로그램이 이전 버전입니다. Chrome 확장 관리에서 extensions/order-collector 를 새로고침한 뒤 다시 시도해주세요.',
    );
  }

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
}): Promise<{
  rows: RocketPoCatalogRow[];
  poCount: number;
  collection: RocketPoCollectionEvidence;
}> {
  return collectRocketPoRows(
    { from, to, status, dateType },
    'collectRocketPoRowsEvidenceV1',
  );
}

export async function collectRocketPoRowsForConfirmationFromExtension({
  from,
  to,
}: {
  from: string;
  to: string;
}): Promise<{
  rows: RocketPoCatalogRow[];
  poCount: number;
  collection: RocketPoCollectionEvidence;
}> {
  return collectRocketPoRows(
    { from, to, status: 'RP', dateType: 'WAREHOUSING_PLAN_DATE' },
    'collectRocketPoRowsConfirmationV1',
  );
}

async function collectRocketPoRows(
  input: {
    from: string;
    to: string;
    status: RocketPoStatusCode;
    dateType: 'WAREHOUSING_PLAN_DATE' | 'PURCHASE_ORDER_DATE';
  },
  requiredCapability: string,
): Promise<{
  rows: RocketPoCatalogRow[];
  poCount: number;
  collection: RocketPoCollectionEvidence;
}> {
  const { from, to, status, dateType } = input;
  const runId = globalThis.crypto.randomUUID();
  const extensionId = await detectRocketOrderExtensionId(requiredCapability);
  const res = await sendToExtension<CollectResponse>(
    extensionId,
    { action: 'collectRocketPoRows', from, to, status, dateType, runId },
    190000,
  );
  if (!res) {
    throw new Error(
      '주문수집 확장이 로켓 발주 수집 액션에 응답하지 않았습니다. Chrome 확장 관리에서 extensions/order-collector 를 새로고침해주세요.',
    );
  }
  if (!res.success || !res.rows || !res.evidence) {
    throw Object.assign(new Error(res.error ?? '로켓 발주 수집에 실패했습니다.'), {
      pendingLogin: res.pendingLogin === true,
    });
  }
  const collection = RocketPoCollectionEvidenceSchema.parse(res.evidence);
  if (collection.collectionRunId !== runId) {
    throw new Error('Rocket collection run identity does not match the browser request.');
  }
  const rows = res.rows.map((row) => RocketPoCatalogRowSchema.parse(row));
  if (
    requiredCapability === 'collectRocketPoRowsConfirmationV1'
    && rows.some((row) => !row.confirmation || row.barcode.length === 0)
  ) {
    throw new Error(
      '로켓 발주확정 자료가 누락되었습니다. Chrome 확장 관리에서 주문수집 확장을 새로고침한 뒤 다시 수집해 주세요.',
    );
  }
  return {
    rows,
    poCount: res.poCount ?? 0,
    collection,
  };
}
