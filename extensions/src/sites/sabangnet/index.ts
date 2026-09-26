import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { callPage } from '../page-call';
import { registerSite } from '../registry';
import { hostWithin, leftForOperator, type PageGuard, type TabPage, type TabPages } from '../tab-page';

export const SABANGNET_ORIGIN = 'https://sbadmin08.sabangnet.co.kr';
const PAGE_URL = `${SABANGNET_ORIGIN}/`;
export const SABANGNET_MALL_LISTINGS_FILE = 'content/orders/sabangnet-mall-listings.js';
/** 옛 수집기의 탭 준비 제한(45초)과 요청 제한(30초, 처리기 안) 그대로. */
const NAVIGATION_TIMEOUT_MS = 45_000;
const PAGE_CALL_TIMEOUT_MS = 35_000;
/** 사방넷 서버에 부담을 주지 않게 쪽 사이를 띄운다(옛 수집기와 같다). 6천여 건이 13쪽이다. */
export const SABANGNET_PAGE_DELAY_MS = 800;
const LOGIN_MESSAGE = '사방넷 로그인이 필요합니다. 열린 사방넷 화면에서 로그인한 뒤 다시 가져와 주세요.';
export const MALL_CONTRACT_CHANGED = 'MALL_CONTRACT_CHANGED' as const;

export const SABANGNET_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['sabangnet.co.kr']),
  isLogin: (url) => hostWithin(url, ['sabangnet.co.kr']) && /login/i.test(`${url.pathname}${url.hash}`),
  loginMessage: LOGIN_MESSAGE,
};

/** 사방넷 목록 행에서 처리기가 복사한 칸(원문 그대로의 문자열·숫자). 로그인 칸은 없다. */
export interface SabangnetListItem {
  shmaId: string | number | null;
  prdRegsTrnmSrno: string | number | null;
  shmaPrdNo: string | number | null;
  prdNo: string | number | null;
  prdNm: string | number | null;
  prdSplyStsCdNm: string | number | null;
  modlNm: string | number | null;
  onsfPrdCd: string | number | null;
  sepr: string | number | null;
  prdRegsFstTrnmDt: string | number | null;
}

export interface SabangnetListQuery {
  listPath: string;
  dateFrom: string;
  dateTo: string;
  pageSize: number;
}

type PageAnswer =
  | { status: 'ok'; total: number; items: SabangnetListItem[] }
  | { status: 'login_required' }
  | { status: 'http_error'; httpStatus: number }
  | { status: 'contract_drift'; stage: string }
  | { status: 'timeout' }
  | { status: 'network_failed' };

/**
 * 사방넷 관리자(sbadmin08) 사이트(KID-363 L1). 운영자가 열어 둔 사방넷 탭은 건드리지 않고 백그라운드 탭을 새로 열어
 * 쪽마다 페이지 호출(ISOLATED 처리기 파일)로 읽는다. 쪽 사이는 800ms 띄운다(옛 간격). 여러 쪽을 읽는 동안 탭은 하나이고, `close()`가 닫는다 — 로그인
 * 화면에서 멈췄으면 운영자가 로그인하도록 남긴다. 탭 잠금은 서버 lockKey `resource:sabangnet:login`이 한다.
 */
export function createSabangnetSite(tabs: TabPages, sleep: (ms: number) => Promise<void>) {
  let pagesRead = 0;
  let tab: Promise<TabPage> | null = null;
  let opened: TabPage | null = null;
  let keepOpen = false;

  function page(): Promise<TabPage> {
    tab ??= (async () => {
      const next = await tabs.open('about:blank');
      opened = next;
      await next.navigate(PAGE_URL, { timeoutMs: NAVIGATION_TIMEOUT_MS });
      return next;
    })();
    return tab;
  }

  async function read(query: SabangnetListQuery, currentPage: number): Promise<{ total: number; items: SabangnetListItem[] }> {
    if (pagesRead > 0) await sleep(SABANGNET_PAGE_DELAY_MS);
    pagesRead += 1;
    const answer = await callPage<PageAnswer>(await page(), 'sabangnet.mallListingPage', { ...query, currentPage }, {
      timeoutMs: PAGE_CALL_TIMEOUT_MS,
      guard: SABANGNET_PAGE_GUARD,
      isolated: [SABANGNET_MALL_LISTINGS_FILE],
      displayName: '사방넷',
    });
    switch (answer?.status) {
      case 'ok':
        return { total: answer.total, items: answer.items };
      case 'login_required':
        throw new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE, { url: PAGE_URL });
      case 'http_error':
        throw new RuntimeError(SITE_REQUEST_FAILED, `사방넷 송신 기록을 읽지 못했습니다(HTTP ${answer.httpStatus}).`, {
          status: answer.httpStatus, url: PAGE_URL, reason: 'http', bodyHead: null,
        });
      case 'contract_drift':
        throw new RuntimeError(MALL_CONTRACT_CHANGED, `사방넷 목록 형식이 바뀌어 가져오기를 멈췄습니다. [${answer.stage}]`, { stage: answer.stage });
      case 'timeout':
        throw new RuntimeError(SITE_REQUEST_FAILED, '사방넷 응답이 늦어 가져오기를 멈췄습니다.', { status: null, url: PAGE_URL, reason: 'timeout', bodyHead: null });
      default:
        throw new RuntimeError(SITE_REQUEST_FAILED, '사방넷 송신 기록을 읽지 못했습니다.', { status: null, url: PAGE_URL, reason: 'network', bodyHead: null });
    }
  }

  return {
    /** "쇼핑몰상품수정" 목록 한 쪽(1부터). 실패 이력 줄은 뺀다. `total`은 사방넷이 알린 전체 송신 기록 수. */
    async mallListingPage(query: SabangnetListQuery, currentPage: number) {
      try {
        return await read(query, currentPage);
      } catch (error) {
        if (leftForOperator(error)) keepOpen = true;
        throw error;
      }
    },
    /** 이 사이트가 연 탭을 닫는다. 로그인·예상 밖 주소에서 멈췄으면 남긴다. */
    async close() {
      if (opened && !keepOpen) await opened.close();
      opened = null;
      tab = null;
    },
  };
}

export type SabangnetSite = ReturnType<typeof createSabangnetSite>;

registerSite({ name: 'sabangnet', opensOwnTabs: true, create: (deps) => createSabangnetSite(deps.tabs, deps.sleep) });
