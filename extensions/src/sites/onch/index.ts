import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { withFreshTab } from '../fresh-tab';
import { callPage } from '../page-call';
import { registerSite } from '../registry';
import { createSiteSignIn, type LoginSpec, type SiteSignIn } from '../site-login';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

/** 공급사 주문 목록(전체 상태). 목록·상세 모달은 이 화면의 같은 출처 상대 주소다. */
export const ONCH_ORDER_URL = 'https://www.onch3.co.kr/supplier/orders.php?state=all';
export const ONCH_ORDERS_FILE = 'content/page-call/onch-orders.js';
/** 옛 수집기의 주입 제한 시간(주문마다 상세 모달을 읽는다). */
const READ_TIMEOUT_MS = 120_000;
const LOGIN_MESSAGE = '온채널 로그인이 필요합니다. onch3.co.kr 에 로그인한 뒤 다시 수집해 주세요.';
const HOSTS = ['onch3.co.kr'];

/** 로그아웃이면 공급사 화면이 /login/login_web.php 로 넘어간다(옛 `mall-session.js` onch 줄, 2026-09-12 실측). */
const isOnchLogin = (url: URL) => hostWithin(url, HOSTS) && /\/login\//i.test(url.pathname);

export const ONCH_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, HOSTS),
  isLogin: isOnchLogin,
  loginMessage: LOGIN_MESSAGE,
};

/** 온채널 로그인 입구(옛 `mall-session.js` onch 줄: entry = login = 공급사 주문 목록). */
export const ONCH_LOGIN: LoginSpec = {
  displayName: '온채널',
  loginUrl: ONCH_ORDER_URL,
  hosts: HOSTS,
  isLoginUrl: isOnchLogin,
  fields: ['loginId', 'password'],
};

type OnchAnswer =
  | { status: 'ok'; orders: unknown[] }
  | { status: 'login_required' }
  | { status: 'failed'; error: string };

/**
 * 온채널(onch3.co.kr) 주문 읽기(KID-380, `orders.mall_orders`). 새 백그라운드 탭에서 공급사 주문 목록을 열어 ISOLATED
 * 처리기(`content/page-call/onch-orders.js`, 옛 `scrapeOnchannelOrders`)가 그날 주문을 목록 + 주문별 상세 모달로 읽는다.
 * 원소는 옛 변환 본문 `{orders}`의 주문 그대로다(옛 확장 변환기도 바꾸지 않고 보냈다). 읽기만 한다.
 */
export function createOnchSite(tabs: TabPages, signIn?: SiteSignIn) {
  return {
    readOrders(input: { collectionDate: string | null }): Promise<{ rows: unknown[] }> {
      return withFreshTab(tabs, ONCH_ORDER_URL, async (page) => {
        const answer = await callPage<OnchAnswer>(page, 'onch.orders', { dateFilter: input.collectionDate ?? '' }, {
          timeoutMs: READ_TIMEOUT_MS,
          guard: ONCH_PAGE_GUARD,
          isolated: [ONCH_ORDERS_FILE],
          displayName: '온채널',
        });
        if (answer?.status === 'ok') return { rows: answer.orders };
        if (answer?.status === 'login_required') throw new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE, { url: ONCH_ORDER_URL });
        throw new RuntimeError(SITE_REQUEST_FAILED, `온채널 주문을 읽지 못했습니다: ${answer?.status === 'failed' ? answer.error : '알 수 없음'}`, {
          status: null,
          reason: 'page_error',
          url: ONCH_ORDER_URL,
        });
      }, signIn ? { signIn } : {});
    },
  };
}

registerSite({ name: 'onch', create: (deps, lease) => createOnchSite(deps.tabs, createSiteSignIn(ONCH_LOGIN, lease.credentials, deps)) });
