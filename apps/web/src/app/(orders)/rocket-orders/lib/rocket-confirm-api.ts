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

async function detectRocketOrderExtensionId(requiredCapability: string): Promise<string> {
  const exactId = await detectOrderCollectionExtensionId(1200, requiredCapability);
  if (exactId) return exactId;

  // 이전에 로드된 확장은 action 은 있어도 ping capabilities 에 새 키가 없을 수 있다.
  // 기본 주문수집 capability 로 한 번 더 잡아보고, 실제 action 호출 결과로 버전 문제를 판단한다.
  const compatibleId = await detectOrderCollectionExtensionId();
  if (compatibleId) return compatibleId;

  throw new Error(
    '주문수집 확장프로그램을 찾지 못했습니다. extensions/order-collector 를 Chrome 에 로드/새로고침하고 supplier.coupang.com 로그인 후 다시 시도해주세요.',
  );
}

/** order-collector 확장으로 거래처확인요청 발주 풀컬럼을 supplier 세션에서 수집. */
export async function collectRocketPoRowsFromExtension(
  from: string,
  to: string,
): Promise<{ rows: RocketConfirmSourceRow[]; poCount: number }> {
  const extensionId = await detectRocketOrderExtensionId('collectRocketPoRows');
  const res = await sendToExtension<CollectResponse>(
    extensionId,
    { action: 'collectRocketPoRows', from, to },
    190000,
  );
  if (!res) {
    throw new Error(
      '주문수집 확장이 로켓 발주 수집 액션에 응답하지 않았습니다. Chrome 확장 관리에서 extensions/order-collector 를 새로고침해주세요.',
    );
  }
  if (!res?.success || !res.rows) {
    throw new Error(res?.error ?? '로켓 발주 수집에 실패했습니다.');
  }
  return { rows: res.rows, poCount: res.poCount ?? 0 };
}

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

/** 발주현황(상태) → 쿠팡 po-web 상태코드 */
const ROCKET_STATUS_CODE: Record<string, string> = {
  거래처확인요청: 'RP',
  발주확정: 'PA',
  거래명세서확인요청: 'RI',
  거래명세서확인: 'CI',
};

/** 입고예정일(KST) 범위 + 발주현황으로 발주 목록(PO 단위)을 supplier 세션에서 빠르게 조회. */
export async function listRocketPosFromExtension(
  from: string,
  to: string,
  status = '',
): Promise<RocketPoSummary[]> {
  const extensionId = await detectRocketOrderExtensionId('listRocketPos');
  const statusCode = status ? ROCKET_STATUS_CODE[status] ?? '' : '';
  const res = await sendToExtension<{ success?: boolean; pos?: RocketPoSummary[]; error?: string }>(
    extensionId,
    { action: 'listRocketPos', from, to, status: statusCode },
    70000,
  );
  if (!res) {
    throw new Error(
      '주문수집 확장이 로켓 발주 목록 액션에 응답하지 않았습니다. Chrome 확장 관리에서 extensions/order-collector 를 새로고침해주세요.',
    );
  }
  if (!res?.success || !res.pos) {
    throw new Error(res?.error ?? '로켓 발주 목록 조회에 실패했습니다.');
  }
  return res.pos;
}

export interface RocketConfirmSummary {
  total: number;
  confirmed: number;
  short: number;
  matched: number;
}

export interface RocketGeneratedFile {
  blob: Blob;
  fileName: string;
  summary: RocketConfirmSummary;
}

/** 발주 행(편집값 포함)을 백엔드로 보내 업로드 양식(.xlsx)을 생성해 blob 으로 반환. */
export async function generateRocketConfirmFile(
  rows: RocketConfirmSourceRow[],
): Promise<RocketGeneratedFile> {
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
  return {
    blob,
    fileName,
    summary: {
      total: Number(res.headers.get('X-Rocket-Total') ?? 0),
      confirmed: Number(res.headers.get('X-Rocket-Confirmed') ?? 0),
      short: Number(res.headers.get('X-Rocket-Short') ?? 0),
      matched: Number(res.headers.get('X-Rocket-Matched') ?? 0),
    },
  };
}

export { downloadBlob };

/** 납품부족사유 드롭다운 (쿠팡 양식 hiddenSheet 와 동일). */
export const ROCKET_SHORTAGE_REASONS = [
  '협력사 재고부족 - 수요예측 오류',
  '협력사 재고부족 - 생산캐파 부족 (설비라인/원자재/인력/휴무… 등등)',
  '협력사 재고부족 - 품질적 이슈 (유해물질 발견 / 유통기한 미달)',
  '협력사 재고부족 - 재고 할당정책',
  '협력사 재고부족 - 수입상품 입고지연 (선적/통관지연)',
  '제조사 생산중단 혹은 공급사 취급중단 - 제품 리뉴얼/모델 변경',
  '제조사 생산중단 혹은 공급사 취급중단 - 시장 단종',
  '제조사 생산중단 혹은 공급사 취급중단 - 사업자변경',
  'FC 입고기준 미달로 회송',
  '가격 이슈 (Price) - 매입가 인하 협상 중',
  '가격 이슈 (Price) - 매입가 인상 협상 중',
  '가격 이슈 (Price) - 쿠팡 최저가 매칭',
  '최소발주량 변경 필요 (MOQ)',
  '쿠팡 요청 미납',
  '시즌상품으로 다음 시즌전까지 생산 혹은 취급중단',
  '천재지변/재난과 같은 불가항력적인 사유로 미납',
  '업체 휴무',
  '재무 관련 사유',
  'FC 입고 이슈 - FC 슬롯 예약 불가',
  'FC 입고 이슈 - 밀크런 예약불가',
];

/**
 * 재고 매칭 결과.
 *  - matched:    바코드로 KidItem 재고를 찾음(available 은 숫자, 0 이면 품절)
 *  - no_barcode: 발주에 상품바코드가 없음
 *  - no_product: 바코드는 있으나 그 바코드로 등록된 KidItem 상품이 없음
 *               (셀피아 재고가 있어도 상품에 바코드가 연결 안 되면 여기로 빠짐)
 */
export type RocketMatchReason = 'matched' | 'no_barcode' | 'no_product';

export interface RocketComputedRow extends RocketConfirmSourceRow {
  productName?: string;
  center?: string;
  poRegisteredAt?: string; // 발주일시 "YYYY-MM-DD HH:mm:ss" (KST)
  expectedInboundDate?: string; // 입고예정일 "YYYYMMDD"
  inventoryId?: string;
  optionId?: string;
  available: number | null;
  matchReason?: RocketMatchReason;
  confirmQty: number;
  shortageReason: string;
}

export interface RocketPreview {
  rows: RocketComputedRow[];
  totalRows: number;
  fullyConfirmed: number;
  shortRows: number;
  matchedSkus: number;
}

/** 수집한 발주 행 → 백엔드가 재고로 확정수량/사유 계산해 편집 미리보기용으로 반환. */
export async function previewRocketConfirm(rows: RocketConfirmSourceRow[]): Promise<RocketPreview> {
  return apiClient.post<RocketPreview>('/api/orders/rocket/confirm-preview', { rows });
}

export interface RocketConfirmCommitResult {
  reservedRows: number;
  alreadyReservedRows: number;
  skippedRows: number;
  failedRows: number;
  skipped?: Array<{
    poNumber: string;
    productNo: string;
    barcode: string;
    reason: 'zero_confirm_qty' | 'unmatched_inventory';
  }>;
  failed?: Array<{
    poNumber: string;
    productNo: string;
    barcode: string;
    reason: string;
  }>;
}

export async function commitRocketConfirmRows(
  rows: RocketComputedRow[],
): Promise<RocketConfirmCommitResult> {
  return apiClient.post<RocketConfirmCommitResult>('/api/orders/rocket/confirm-commit', { rows });
}
