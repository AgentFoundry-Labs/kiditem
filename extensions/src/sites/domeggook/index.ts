import { RuntimeError } from '../../core/errors';
import { createSiteCaller, SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED, type SiteCaller, type SiteCallerDeps } from '../../core/site-caller';
import { withFreshTab } from '../fresh-tab';
import { callPage } from '../page-call';
import { registerSite } from '../registry';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';
import { createDomeggookListings } from './listings';

export const DOMEGGOOK_ORDER_LIST_URL = 'https://domeggook.com/sc/order/lstAll';
/** 엑셀 생성 목록(JSON). 로그아웃이면 200에 `{res:false}`, 로그인이면 `{dat:[…]}`(mall-session.js 실측 규칙). */
export const DOMEGGOOK_ORDER_LIST_API = 'https://domeggook.com/sc/excel/getOrderList?format=grid&pg=1';
export const DOMEGGOOK_ORDERS_FILE = 'content/orders/domeggook-orders.js';
/** CSV base64 한 조각의 글자 수 — 청크 1MiB 안에 들게. */
export const DOMEGGOOK_PART_CHARS = 700_000;
const LIST_RENDER_WAIT_MS = 1_500;
/** 옛 수집기의 생성 요청 제한 시간(백그라운드 탭 여럿과 함께 돌면 30초가 모자랐다). */
const REQUEST_TIMEOUT_MS = 60_000;
/** 생성 완료 폴링: 5초마다 48번(최대 4분) — 도매꾹 생성이 느려 넉넉히(옛 규칙 그대로). */
const POLL_MS = 5_000;
const POLL_ROUNDS = 48;
const LOGIN_MESSAGE = '도매꾹 로그인이 필요합니다. domeggook.com 에 로그인한 뒤 다시 수집해 주세요.';

export const DOMEGGOOK_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['domeggook.com']),
  isLogin: (url) => hostWithin(url, ['domeggook.com']) && /login/i.test(url.pathname),
  loginMessage: LOGIN_MESSAGE,
};

type OrderListEntry = { state?: unknown; dlBtn?: unknown; dateReq?: unknown };
type RequestAnswer = { status: 'requested' } | { status: 'empty'; message?: string } | { status: 'failed'; error: string };

/**
 * 엑셀 생성 목록. JSON 객체가 아니면(로그인 화면 HTML) 또는 로그아웃 표시(`res:false`)면 SITE_LOGIN_REQUIRED. 그 밖에
 * `dat` 배열이 없는 JSON은 빈 목록이다(옛 `domeggookOrderList`·`pickDomeggookUrl` 규칙).
 */
async function orderList(caller: SiteCaller): Promise<OrderListEntry[]> {
  const text = await caller.text(DOMEGGOOK_ORDER_LIST_API, { headers: { 'x-requested-with': 'XMLHttpRequest' } });
  let body: unknown = null;
  try {
    body = text.trim().startsWith('{') ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || (body as { res?: unknown }).res === false) {
    throw new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE, { url: DOMEGGOOK_ORDER_LIST_API });
  }
  const list = (body as { dat?: unknown }).dat;
  return Array.isArray(list) ? (list as OrderListEntry[]) : [];
}

/** 생성 완료(SUCCESS) + 전체주문(ORDER_ALL) CSV 주소. `afterReq`보다 늦게 요청한 것(이번에 새로 만든 것)만. */
export function pickDomeggookCsvUrl(entries: readonly OrderListEntry[], afterReq: string): string | null {
  for (const entry of entries) {
    if (entry?.state !== 'SUCCESS' || !/ORDER_ALL/.test(String(entry.dlBtn ?? ''))) continue;
    if (afterReq && !(String(entry.dateReq ?? '') > afterReq)) continue;
    const url = (String(entry.dlBtn).match(/href=['"]([^'"]+)['"]/) ?? [])[1];
    if (url) return url;
  }
  return null;
}

function base64Of(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

/**
 * 도매꾹 주문 읽기(KID-359 H3, `orders.mall_orders`, 옛 worker.js `collectDomeggookOrders` 이식). 엑셀 생성 목록으로
 * 로그인과 요청 전 최신 시각을 보고, 기간을 그날로 맞춘 주문목록 새 탭에서 생성을 요청한다(MAIN world
 * `content/orders/domeggook-orders.js`). 주문이 없다는 alert면 빈 수집이다. 요청 뒤 새로 완료된 ORDER_ALL CSV를
 * 서비스워커가 받아(EUC-KR 원본 바이트 그대로) base64 조각으로 돌려준다 — 서버가 이어 붙여 파일 캡처로 보관한다.
 * 생성 요청 폼이 끝까지 가도록 탭은 CSV를 받을 때까지 열어 둔다.
 */
export function createDomeggookSite(tabs: TabPages, deps: SiteCallerDeps) {
  const caller = createSiteCaller({ minIntervalMs: 0, displayName: '도매꾹', timeoutMs: 30_000 }, deps);
  return {
    ...createDomeggookListings(tabs),
    async readOrders(input: { collectionDate: string | null; signal?: AbortSignal }): Promise<{ rows: unknown[] }> {
      const before = await orderList(caller);
      const beforeReq = String(before[0]?.dateReq ?? '');
      const dateDot = input.collectionDate ? input.collectionDate.replace(/-/g, '.') : '';
      const listUrl = dateDot ? `${DOMEGGOOK_ORDER_LIST_URL}?dtbase=ord&dt1=${dateDot}&dt2=${dateDot}` : DOMEGGOOK_ORDER_LIST_URL;
      return withFreshTab(tabs, listUrl, async (page) => {
        await deps.sleep(LIST_RENDER_WAIT_MS);
        const answer = await callPage<RequestAnswer>(page, 'domeggook.requestExcel', {}, {
          timeoutMs: REQUEST_TIMEOUT_MS,
          guard: DOMEGGOOK_PAGE_GUARD,
          main: [DOMEGGOOK_ORDERS_FILE],
          displayName: '도매꾹',
        });
        if (answer?.status === 'empty') return { rows: [] };
        if (answer?.status !== 'requested') {
          throw new RuntimeError(SITE_REQUEST_FAILED, answer?.status === 'failed' ? answer.error : '도매꾹 엑셀 생성 요청 실패', {
            status: null,
            reason: 'page_error',
            url: listUrl,
          });
        }
        let csvUrl: string | null = null;
        for (let round = 0; round < POLL_ROUNDS && !csvUrl; round += 1) {
          await deps.sleep(POLL_MS);
          input.signal?.throwIfAborted();
          csvUrl = pickDomeggookCsvUrl(await orderList(caller), beforeReq);
        }
        if (!csvUrl) {
          throw new RuntimeError(SITE_REQUEST_FAILED, '도매꾹 엑셀 생성이 지연됩니다(최대 4분 대기 초과). 잠시 후 다시 시도하세요.', {
            status: null,
            reason: 'excel_not_ready',
            url: DOMEGGOOK_ORDER_LIST_API,
          });
        }
        // CDN 파일 주소는 리다이렉트를 따라간다(옛 서비스워커 fetch 기본값). 로그인 판정용 manual은 목록 조회에만 쓴다.
        const base64 = base64Of(await caller.bytes(csvUrl, { redirect: 'follow' }));
        const fileName = csvUrl.split('/').pop() || 'domeggook.csv';
        const parts = Math.max(1, Math.ceil(base64.length / DOMEGGOOK_PART_CHARS));
        return {
          rows: Array.from({ length: parts }, (_, part) => ({
            fileName,
            part,
            parts,
            base64: base64.slice(part * DOMEGGOOK_PART_CHARS, (part + 1) * DOMEGGOOK_PART_CHARS),
          })),
        };
      });
    },
  };
}

registerSite({ name: 'domeggook', create: (deps) => createDomeggookSite(deps.tabs, deps) });
