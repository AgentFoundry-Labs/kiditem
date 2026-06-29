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
  const extensionId = await detectOrderCollectionExtensionId(1200, 'collectRocketPoRows');
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
  const extensionId = await detectOrderCollectionExtensionId(1200, 'listRocketPos');
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/order-collector 를 Chrome 에 로드하고 supplier.coupang.com 에 로그인한 뒤 다시 시도해주세요.',
    );
  }
  const statusCode = status ? ROCKET_STATUS_CODE[status] ?? '' : '';
  const res = await sendToExtension<{ success?: boolean; pos?: RocketPoSummary[]; error?: string }>(
    extensionId,
    { action: 'listRocketPos', from, to, status: statusCode },
    70000,
  );
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

export interface RocketComputedRow extends RocketConfirmSourceRow {
  productName?: string;
  center?: string;
  inventoryId?: string;
  optionId?: string;
  available: number | null;
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
  skipped?: Array<{
    poNumber: string;
    barcode: string;
    reason: 'zero_confirm_qty' | 'unmatched_inventory';
  }>;
}

export async function commitRocketConfirmRows(
  rows: RocketComputedRow[],
): Promise<RocketConfirmCommitResult> {
  return apiClient.post<RocketConfirmCommitResult>('/api/orders/rocket/confirm-commit', { rows });
}
