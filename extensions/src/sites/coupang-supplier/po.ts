import { RuntimeError } from '../../core/errors';
import { SITE_REQUEST_FAILED } from '../../core/site-caller';
import type { TabPage } from '../tab-page';
import { COUPANG_SUPPLIER_ORIGIN, cookieBloat, loginRequired, responseInvalid, supplierPage, type PageTable, type SupplierPage } from './page';

/**
 * 쿠팡 서플라이어 발주 화면(로켓 PO·directship, KID-359). 옛 `coupang-po-session.js`·`rocket-po-collection.js`·
 * worker.js 직배송 수집기의 요청을 그대로 옮겼다: 발주 세션은 `/scm/purchase/order/list`로 들어가 `/po-web/purchase/order`
 * 화면에 닿아야 준비된 것이고, 목록은 JSON, 상세는 HTML 표다.
 */
export const PO_BOOTSTRAP_URL = `${COUPANG_SUPPLIER_ORIGIN}/scm/purchase/order/list`;
const PO_READY_PATH_PREFIX = '/po-web/purchase/order';
const NAVIGATION_TIMEOUT_MS = 30_000;

export function isReadyPoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === COUPANG_SUPPLIER_ORIGIN && url.pathname.startsWith(PO_READY_PATH_PREFIX);
  } catch {
    return false;
  }
}

/**
 * 발주 세션 준비(옛 `prepare`): 탭을 부트스트랩 주소로 옮겨 PO 화면에 닿는지 본다. 닿지 않으면 쿠키 과다(400 화면)인지
 * 먼저 보고 — 그러면 다시 해도 같다 — 아니면 한 번 더 옮겨 본다(옛 "prepare를 한 번 더"). 그래도 아니면 로그인 필요.
 */
export async function preparePoSession(tab: TabPage): Promise<SupplierPage> {
  const page = supplierPage(tab);
  for (let attempt = 1; ; attempt += 1) {
    const landed = await tab.navigate(PO_BOOTSTRAP_URL, { timeoutMs: NAVIGATION_TIMEOUT_MS });
    if (isReadyPoUrl(landed)) return page;
    const body = isSupplierUrl(landed) ? await page.bodyText().catch(() => '') : '';
    if (/HTTP Status 400|Bad Request/i.test(body)) throw cookieBloat(landed, 400);
    if (attempt >= 2) throw loginRequired(landed);
  }
}

function isSupplierUrl(value: string): boolean {
  try {
    return new URL(value).origin === COUPANG_SUPPLIER_ORIGIN;
  } catch {
    return false;
  }
}

/** 발주 목록 한 쪽의 JSON 본문(`body.body` 행, `body.lastPageNumber`). */
export interface PurchaseOrderListPage {
  rows: unknown[];
  lastPageNumber: unknown;
}

/**
 * `/po-web/app/purchase-order/list` 한 쪽. 2xx가 아니거나 HTML·JSON 아님이면 첫 쪽은 세션 만료(로그인 필요),
 * 그 뒤 쪽은 요청 실패(옛 규칙). 행 배열이 없으면 형식 오류.
 */
export async function readPurchaseOrderListPage(page: SupplierPage, path: string, pageNumber: number): Promise<PurchaseOrderListPage> {
  const fetched = await page.fetch(path, { headers: { accept: 'application/json' } });
  const text = fetched.text;
  const failed = () =>
    pageNumber === 1
      ? loginRequired(fetched.url)
      : new RuntimeError(SITE_REQUEST_FAILED, `발주 목록 ${pageNumber}쪽을 읽지 못했습니다.`, { status: fetched.status, url: path, reason: 'http', bodyHead: null });
  if (fetched.status === 400 || fetched.status === 413 || fetched.status === 431) throw cookieBloat(path, fetched.status);
  if (fetched.status < 200 || fetched.status >= 300 || text.trim().charAt(0) === '<') throw failed();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw failed();
  }
  const body = (parsed as { body?: { body?: unknown; lastPageNumber?: unknown } } | null)?.body;
  if (!body || !Array.isArray(body.body)) throw responseInvalid(path, `발주 목록 ${pageNumber}쪽에 행 배열이 없습니다.`);
  return { rows: body.body, lastPageNumber: body.lastPageNumber };
}

export function purchaseOrderDetailPath(poNumber: string): string {
  return `/scm/purchase/order/get/${encodeURIComponent(poNumber)}`;
}

/**
 * 발주서 상세 HTML을 표로 읽는다(옛 수집기의 DOM 부분 — 해석은 수집기가 한다). 2xx가 아니거나 HTML이 아니면
 * 요청 실패, 표가 하나도 없고 로그인·세션 만료 글이 있으면 로그인 필요.
 */
export async function readPurchaseOrderDetail(page: SupplierPage, poNumber: string): Promise<PageTable[]> {
  const path = purchaseOrderDetailPath(poNumber);
  const fetched = await page.fetch(path, { tables: true });
  if (fetched.status < 200 || fetched.status >= 300 || !/^\s*</.test(fetched.text)) {
    throw new RuntimeError(SITE_REQUEST_FAILED, `발주서 ${poNumber} 상세를 읽지 못했습니다.`, { status: fetched.status, url: path, reason: 'http', bodyHead: null });
  }
  const tables = fetched.tables ?? [];
  if (tables.length === 0 && /(?:login|로그인|session\s+expired|세션\s*만료)/i.test(fetched.text)) throw loginRequired(fetched.url);
  return tables;
}

/**
 * 직배송: 품목 상세를 읽기 전에 탭을 첫 발주서 상세(/scm)로 옮긴다(옛 수집기 "품목 fetch 인증 위해" 그대로).
 */
export async function enterScmContext(tab: TabPage, poNumber: string): Promise<void> {
  await tab.navigate(`${COUPANG_SUPPLIER_ORIGIN}${purchaseOrderDetailPath(poNumber)}`, { timeoutMs: NAVIGATION_TIMEOUT_MS });
}

/** 직배송이 쓰는 센터 목록(`/po-web/app/center/purchasable/list`) 본문. */
export async function readPurchasableCenters(page: SupplierPage): Promise<unknown> {
  const path = '/po-web/app/center/purchasable/list';
  const fetched = await page.fetch(path, { headers: { accept: 'application/json' } });
  if (fetched.status < 200 || fetched.status >= 300 || fetched.text.trim().charAt(0) === '<') {
    throw new RuntimeError(SITE_REQUEST_FAILED, '센터 목록을 읽지 못했습니다.', { status: fetched.status, url: path, reason: 'http', bodyHead: null });
  }
  try {
    return JSON.parse(fetched.text) as unknown;
  } catch {
    throw responseInvalid(path, '센터 목록 응답이 JSON이 아닙니다.');
  }
}
