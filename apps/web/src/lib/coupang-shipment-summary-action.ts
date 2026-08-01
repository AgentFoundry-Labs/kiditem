import { apiClient } from '@/lib/api-client';
import {
  detectOrderCollectionExtensionId,
  sendToExtension,
} from '@/lib/extension-bridge';

export const COUPANG_COOKIE_BLOAT_CODE = 'coupang_cookie_bloat';
export const COUPANG_SHIPMENT_SESSION_REQUIRED_CODE = 'coupang_shipment_session_required';
export const COUPANG_SHIPMENT_RESPONSE_INVALID_CODE = 'coupang_shipment_response_invalid';

const ORDER_COLLECTOR_REQUIRED_MESSAGE =
  '주문수집 확장프로그램이 필요합니다. extensions/kiditem-os를 Chrome에서 로드한 뒤 다시 시도해주세요.';
const ORDER_COLLECTOR_RELOAD_MESSAGE =
  '주문수집 확장프로그램이 이전 버전입니다. Chrome 확장 관리에서 extensions/kiditem-os를 새로고침한 뒤 다시 시도해주세요.';
const VERIFICATION_ERROR_MESSAGE =
  '발송일 요약 저장을 서버에서 확인하지 못했습니다. 다시 조회해주세요.';

export class CoupangShipmentExtensionError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'CoupangShipmentExtensionError';
    this.code = code;
  }
}

export interface CoupangShipmentDateSummaryItem {
  date: string;
  count: number;
  boxes: number;
}

type CoupangShipmentDateSummaryResult = {
  success: boolean;
  error?: string;
  errorCode?: string;
  scannedPages?: number;
  totalRows?: number;
  dates?: CoupangShipmentDateSummaryItem[];
};

type PersistedDateSummaryResponse = {
  items: Array<CoupangShipmentDateSummaryItem & { capturedAt: string }>;
};

export type CoupangShipmentSummaryActionResult =
  | { status: 'empty'; items: [] }
  | {
      status: 'collected';
      items: CoupangShipmentDateSummaryItem[];
      latest: CoupangShipmentDateSummaryItem;
    };

export function isCoupangCookieBloatError(error: unknown): boolean {
  return error instanceof CoupangShipmentExtensionError
    && error.code === COUPANG_COOKIE_BLOAT_CODE;
}

export function isCoupangShipmentSessionRequiredError(error: unknown): boolean {
  return error instanceof CoupangShipmentExtensionError
    && error.code === COUPANG_SHIPMENT_SESSION_REQUIRED_CODE;
}

/** Exact manual action used by both the shipment screen and dashboard. */
export async function collectAndPersistCoupangShipmentSummary(): Promise<
  CoupangShipmentSummaryActionResult
> {
  const collected = await collectCoupangShipmentDateSummaryViaExtension();
  if (collected.length === 0) return { status: 'empty', items: [] };

  await apiClient.put<PersistedDateSummaryResponse>('/api/coupang-shipments/date-summary', {
    items: collected,
  });
  const persisted = await apiClient.get<PersistedDateSummaryResponse>(
    '/api/coupang-shipments/date-summary',
  );
  const persistedByDate = new Map(persisted.items.map((item) => [item.date, item]));
  for (const expected of collected) {
    const actual = persistedByDate.get(expected.date);
    if (!actual || actual.count !== expected.count || actual.boxes !== expected.boxes) {
      throw new Error(VERIFICATION_ERROR_MESSAGE);
    }
  }

  const items = persisted.items.map(({ date, count, boxes }) => ({ date, count, boxes }));
  const latest = [...collected].sort((left, right) => right.date.localeCompare(left.date))[0]!;
  return { status: 'collected', items, latest };
}

export async function collectCoupangShipmentDateSummaryViaExtension(): Promise<
  CoupangShipmentDateSummaryItem[]
> {
  const extensionId = await getValidatedDateSummaryExtensionId();
  const response = await sendToExtension<CoupangShipmentDateSummaryResult>(
    extensionId,
    { action: 'collectCoupangShipmentDateSummary' },
    90_000,
  );
  if (!response?.success) {
    throw new CoupangShipmentExtensionError(
      response?.error ?? '쿠팡 쉽먼트 발송일 조회에 실패했습니다.',
      response?.errorCode,
    );
  }
  return validateDateSummaryResponse(response);
}

async function getValidatedDateSummaryExtensionId(): Promise<string> {
  const extensionId = await detectOrderCollectionExtensionId(
    1_200,
    'collectCoupangShipmentDateSummaryValidatedV1',
  );
  if (extensionId) return extensionId;

  const legacyExtensionId = await detectOrderCollectionExtensionId(
    1_200,
    'collectCoupangShipmentFiles',
  );
  if (legacyExtensionId) throw new Error(ORDER_COLLECTOR_RELOAD_MESSAGE);

  if (typeof window !== 'undefined'
    && window.location.hostname === 'localhost'
    && window.location.port !== '3000') {
    throw new Error(
      '주문수집 확장프로그램은 로컬 앱의 http://localhost:3000 에서 연결됩니다. 웹 앱을 3000 포트로 열어 다시 시도해주세요.',
    );
  }
  throw new Error(ORDER_COLLECTOR_REQUIRED_MESSAGE);
}

function validateDateSummaryResponse(
  response: CoupangShipmentDateSummaryResult,
): CoupangShipmentDateSummaryItem[] {
  const invalid = (): never => {
    throw new CoupangShipmentExtensionError(
      '쿠팡 쉽먼트 조회 결과가 불완전합니다. 주문수집 확장프로그램을 새로고침한 뒤 다시 조회해주세요.',
      COUPANG_SHIPMENT_RESPONSE_INVALID_CODE,
    );
  };
  if (
    !Array.isArray(response.dates)
    || !Number.isInteger(response.scannedPages)
    || (response.scannedPages ?? 0) < 1
    || !Number.isInteger(response.totalRows)
    || (response.totalRows ?? -1) < 0
  ) {
    return invalid();
  }

  const seenDates = new Set<string>();
  let countedRows = 0;
  for (const item of response.dates) {
    if (
      !item
      || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)
      || seenDates.has(item.date)
      || !Number.isInteger(item.count)
      || item.count < 1
      || !Number.isInteger(item.boxes)
      || item.boxes < 0
    ) {
      return invalid();
    }
    seenDates.add(item.date);
    countedRows += item.count;
  }
  if (countedRows !== response.totalRows) return invalid();
  return response.dates;
}
