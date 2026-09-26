import { WING_ITEMWINNER_MAX_ITEMS, type WingItemwinnerRow } from '@kiditem/shared/advertising-operations';
import { RuntimeError } from '../../core/errors';
import { SITE_REQUEST_FAILED, createSiteCaller, type SiteCaller, type SiteCallerOptions } from '../../core/site-caller';
import { registerSite } from '../registry';
import { readWingVendorId } from './vendor-identity';

/**
 * Wing 가격관리 화면(`/tenants/seller-price-management`)이 쓰는 아이템위너 목록 API. 읽기 전용 조회다(POST지만
 * 검색 본문일 뿐 아무것도 바꾸지 않는다). 옛 content script `wing-read-api.js`의 `collectItemwinner`를 서비스워커로
 * 옮겼다(KID-362): 쿠키로 부르고 `XSRF-TOKEN` 쿠키를 `X-XSRF-TOKEN` 헤더로 싣는다(없으면 보내지 않는다).
 *
 * 옛 규칙 그대로: 판매중 전체를 한 쪽(1,000개)으로 받는다. 1,000개를 넘거나 한 쪽에 다 오지 않으면 잘린 목록을
 * 완결로 보지 않고 멈춘다. 0개는 Wing이 `pageSize: 10, totalPages: 0`으로 답한다.
 */
export const WING_ORIGIN = 'https://wing.coupang.com';
export const WING_ITEMWINNER_URL = `${WING_ORIGIN}/tenants/seller-price-management/getProductList`;
/** 옛 수집이 열던 아이템위너 화면. 판매자 식별자를 이 화면의 HTML로 확인한다(옛 content script가 같은 화면에서 확인했다). */
export const WING_ITEMWINNER_PAGE_URL = `${WING_ORIGIN}/tenants/seller-price-management`;
const PAGE_SIZE = 1_000;
const EMPTY_PAGE_SIZE = 10;
export const WING_ITEMWINNER_CALLER: SiteCallerOptions = {
  minIntervalMs: 1_000,
  timeoutMs: 30_000,
  displayName: '쿠팡 윙',
  xsrf: { cookieUrl: WING_ORIGIN, cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' },
};
export const WING_ITEMWINNER_PAGE_LIMIT_REACHED = 'RUNTIME_PAGE_LIMIT_REACHED' as const;

export interface WingItemwinnerList {
  rows: WingItemwinnerRow[];
  totalSize: number;
}

function requestBody() {
  return {
    searchIds: '',
    sortType: 'MY_VI_SALES_DESC',
    keywords: '',
    revamp: 'B',
    displayCategoryIds: [],
    productName: '',
    brandName: '',
    alarmStatus: 'ALL',
    autoPriceStatus: 'ALL',
    vendorItemStatus: 'ON_SALE',
    itemWinnerStatus: 'ALL',
    rodBadge: 'ALL',
    pageSize: PAGE_SIZE,
    page: 0,
    searchPresets: null,
    isTopGMV: null,
  };
}

/** 판매중 상품 전체의 아이템위너 상태. */
export async function readWingItemwinnerList(caller: SiteCaller): Promise<WingItemwinnerList> {
  const body = await caller.json<unknown>(WING_ITEMWINNER_URL, {
    method: 'POST',
    requireXsrf: true,
    headers: { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody()),
  });
  if (!isRecord(body) || !Array.isArray(body.result)) throw failed('wing_itemwinner_response_invalid', 'Wing 아이템위너 응답 형식이 올바르지 않습니다.');
  const totalSize = integer(body.totalSize);
  const pageIndex = integer(body.page);
  const pageSize = integer(body.pageSize);
  const totalPages = integer(body.totalPages);
  if (totalSize === null || pageIndex !== 0 || pageSize === null || totalPages === null || totalSize < 0 || totalPages < 0) {
    throw failed('wing_itemwinner_response_invalid', 'Wing 아이템위너 응답 형식이 올바르지 않습니다.');
  }
  if (totalSize > WING_ITEMWINNER_MAX_ITEMS) {
    throw new RuntimeError(WING_ITEMWINNER_PAGE_LIMIT_REACHED, `판매중 상품이 ${WING_ITEMWINNER_MAX_ITEMS}개를 넘어 아이템위너를 한 번에 읽지 못했습니다.`, { totalSize });
  }
  const rows = body.result;
  const complete = totalSize === 0
    ? rows.length === 0 && totalPages === 0 && pageSize === EMPTY_PAGE_SIZE
    : pageSize === PAGE_SIZE && totalPages === 1 && rows.length === totalSize;
  if (!complete) throw failed('wing_itemwinner_partial', 'Wing 아이템위너 목록이 한 번에 오지 않았습니다.', { totalSize, rows: rows.length, totalPages });
  const normalized = rows.map(normalizeRow);
  if (new Set(normalized.map((row) => row.vendorItemId)).size !== normalized.length) {
    throw failed('wing_itemwinner_duplicate', 'Wing 아이템위너 응답에 같은 상품이 두 번 있습니다.', { totalSize });
  }
  return { rows: normalized, totalSize };
}

/** 한 행(옛 `normalizeItemwinnerRow`). `isWinner`는 노출제한이 아닌 위너만. 판매량 빈 문자열은 0. */
function normalizeRow(value: unknown): WingItemwinnerRow {
  if (!isRecord(value) || typeof value.winnerStatus !== 'boolean' || typeof value.suppressed !== 'boolean') throw rowInvalid('winnerStatus');
  const vendorItemId = positiveId(value.vendorItemId);
  if (!vendorItemId) throw rowInvalid('vendorItemId');
  const productName = typeof value.productName === 'string' ? value.productName.trim() : '';
  if (!productName) throw rowInvalid('productName');
  const myPrice = integer(value.currentPrice);
  const winnerPrice = integer(value.winnerPrice);
  const salesQty = value.myViSales === '' ? 0 : integer(value.myViSales);
  if (myPrice === null) throw rowInvalid('currentPrice');
  if (winnerPrice === null) throw rowInvalid('winnerPrice');
  if (salesQty === null || salesQty < 0) throw rowInvalid('myViSales');
  return {
    vendorItemId,
    productName: productName.slice(0, 80),
    isWinner: value.winnerStatus && !value.suppressed,
    myPrice,
    winnerPrice,
    salesQty,
    suppressed: value.suppressed,
    providerWinnerStatus: value.winnerStatus,
  };
}

function positiveId(value: unknown): string | null {
  const text = typeof value === 'number' ? (Number.isSafeInteger(value) ? String(value) : '') : typeof value === 'string' ? value.trim() : '';
  return /^\d+$/.test(text) && BigInt(text) > 0n ? text : null;
}

function integer(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  return Number.isSafeInteger(number) ? number : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function rowInvalid(field: string): RuntimeError {
  return failed('wing_itemwinner_row_invalid', 'Wing 아이템위너 행에 필요한 값이 없습니다.', { field });
}

function failed(reason: string, message: string, details: Record<string, unknown> = {}): RuntimeError {
  return new RuntimeError(SITE_REQUEST_FAILED, message, { reason, url: WING_ITEMWINNER_URL, ...details });
}

/** 아이템위너 수집기(`collectors/advertising.wing_itemwinner`)에 넘길 핸들. */
export function createWingItemwinnerSite(caller: SiteCaller): { readVendorId(): Promise<string>; readItemwinnerList(): Promise<WingItemwinnerList> } {
  return {
    readVendorId: () => readWingVendorId(caller, WING_ITEMWINNER_PAGE_URL),
    readItemwinnerList: () => readWingItemwinnerList(caller),
  };
}

// 서비스워커에서 Wing 쿠키로 부른다(KID-362, 상품평과 같은 방식). `account:` 잠금은 윙 탭을 열어 로그인을 유지한다.
registerSite({
  name: 'wing-itemwinner',
  origin: WING_ORIGIN,
  create: (deps) => createWingItemwinnerSite(createSiteCaller(WING_ITEMWINNER_CALLER, deps)),
});
