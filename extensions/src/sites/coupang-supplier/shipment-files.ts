import { RuntimeError } from '../../core/errors';
import type { TabPages } from '../tab-page';
import { COUPANG_SUPPLIER_ORIGIN, cookieBloat, type SupplierPage } from './page';
import { COUPANG_SHIPMENT_URL } from './shipments';

/**
 * 쿠팡 공급사 쉽먼트 화면과 Label·내역서 PDF(KID-366, 옛 `orders/worker.js` `openCoupangShipmentPage`·
 * `fetchCoupangShipmentPdfsInPage`). 실행이 아니라 부른 쪽(웹)에 바로 돌려주는 일이다 — 서버 사실을 쓰지 않는다.
 */
export type ShipmentPdfKind = 'label' | 'manifest';

export interface ShipmentPdfFile {
  seq: string;
  kind: ShipmentPdfKind;
  ok: boolean;
  b64: string | null;
  bytes: number | null;
  error: string | null;
}

export function shipmentPdfPath(seq: string, kind: ShipmentPdfKind): string {
  const path = kind === 'label' ? 'pdf-label' : 'pdf-manifest';
  return `/ibs/shipment/parcel/${path}/generate?parcelShipmentSeq=${encodeURIComponent(seq)}`;
}

/**
 * PDF 하나. 400/413/431은 쿠키 과다라 모든 PDF가 같이 막힌다 — 한 장씩 실패로 적지 않고 `SITE_COOKIE_BLOAT`로 멈춘다
 * (옛 `coupang_cookie_bloat`, 웹은 둘 다 쿠키 정리 안내로 읽는다). 그 밖의 HTTP 실패와 PDF가 아닌 본문은 그 장만 실패다.
 */
export async function readShipmentPdf(page: SupplierPage, seq: string, kind: ShipmentPdfKind): Promise<ShipmentPdfFile> {
  const path = shipmentPdfPath(seq, kind);
  const answer = await page.pdf(path);
  if (answer.status === 400 || answer.status === 413 || answer.status === 431) throw cookieBloat(path, answer.status);
  if (answer.status < 200 || answer.status >= 300) return { seq, kind, ok: false, b64: null, bytes: null, error: `HTTP ${answer.status}` };
  if (!answer.pdf || !answer.b64) return { seq, kind, ok: false, b64: null, bytes: null, error: 'not_pdf' };
  return { seq, kind, ok: true, b64: answer.b64, bytes: answer.bytes, error: null };
}

const SUPPLIER_TABS = `${COUPANG_SUPPLIER_ORIGIN}/*`;
const NAVIGATION_TIMEOUT_MS = 30_000;

/**
 * 쉽먼트 화면을 운영자에게 넘긴다: 열린 쉽먼트 탭이 있으면 그 탭을, 다른 공급사 탭이 있으면 그 탭을 쉽먼트 화면으로
 * 옮기고, 없으면 새 탭을 연다 — 어느 쪽이든 앞으로 가져온다(운영자가 그 화면에서 일한다). `url`은 공급사 주소만 받는다.
 */
export async function openShipmentPage(tabs: TabPages, url: string = COUPANG_SHIPMENT_URL): Promise<{ tabId: number; url: string }> {
  let target: URL | null = null;
  try {
    target = new URL(url);
  } catch {
    target = null;
  }
  if (!target || target.origin !== COUPANG_SUPPLIER_ORIGIN) {
    throw new RuntimeError('VALIDATION_FAILED', '쿠팡 공급사 주소만 열 수 있습니다.', { fields: ['url'] });
  }
  let page = await tabs.find(`${COUPANG_SHIPMENT_URL}*`);
  if (!page) {
    page = (await tabs.find(SUPPLIER_TABS)) ?? (await tabs.open('about:blank'));
    await page.navigate(target.href, { timeoutMs: NAVIGATION_TIMEOUT_MS, continueOnTimeout: true });
  }
  await page.focus();
  return { tabId: page.tabId, url: await page.currentUrl().catch(() => target!.href) };
}
