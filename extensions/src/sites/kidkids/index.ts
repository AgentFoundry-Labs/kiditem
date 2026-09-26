import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { withFreshTab } from '../fresh-tab';
import { callPage } from '../page-call';
import { registerSite } from '../registry';
import { createSiteSignIn, type LoginSpec, type SiteSignIn } from '../site-login';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';
import { createKidkidsListings } from './listings';

/** 출고관리 화면. 목록·발주서 요청은 이 화면의 같은 출처 상대 주소다. */
export const KIDKIDS_ORDER_URL = 'https://partner.kidkids.net/new/pages/logis/management.htm';
export const KIDKIDS_ORDERS_FILE = 'content/orders/kidkids-orders.js';
/** 옛 수집기의 주입 제한 시간(주문 수만큼 발주서를 읽어 길다). */
const READ_TIMEOUT_MS = 180_000;
const LOGIN_MESSAGE = '키드키즈 로그인이 필요합니다. 열려 있는 키드키즈 탭에서 로그인(본인확인)한 뒤 다시 수집해 주세요.';

/** 키드키즈 탭이 있어도 되는 곳. 미로그인은 partnerLogin → www.kidkids.net/join/partner_login.htm, 본인확인은 verify_user. */
export const KIDKIDS_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['kidkids.net']),
  isLogin: (url) => hostWithin(url, ['kidkids.net'])
    && (/login|partnerlogin|partner_login/i.test(url.pathname) || /\/security\/verify_user\.htm$/i.test(url.pathname)),
  loginMessage: LOGIN_MESSAGE,
};

/**
 * 키드키즈 로그인 입구(옛 `mall-session.js` kidkids 줄, KID-377). 미로그인이면 출고관리 → partnerLogin →
 * www.kidkids.net/join/partner_login.htm으로 넘어가고, 로그인 뒤 본인확인(verify_user)이 올 수 있다(운영자가 푼다).
 * 출고관리를 띄운 뒤 클라이언트 리다이렉트로 로그인 화면을 여는 구간이 있어 폼 없는 화면이 5초 이어져야 '폼 없음'이다.
 */
export const KIDKIDS_LOGIN: LoginSpec = {
  displayName: '키드키즈',
  loginUrl: KIDKIDS_ORDER_URL,
  hosts: ['kidkids.net'],
  isLoginUrl: (url) => hostWithin(url, ['kidkids.net']) && /login|partnerlogin|partner_login/i.test(url.pathname),
  isVerificationUrl: (url) => /\/security\/verify_user\.htm$/i.test(url.pathname),
  fields: ['loginId', 'password'],
  settleMs: 5_000,
};

type KidkidsAnswer =
  | { status: 'ok'; orders: unknown[] }
  | { status: 'login_required' }
  | { status: 'failed'; error: string };

/**
 * 키드키즈(partner.kidkids.net) 주문 읽기(KID-359 H3, `orders.mall_orders`). 새 백그라운드 탭에서 출고관리 화면을 열어
 * ISOLATED 처리기(`content/orders/kidkids-orders.js`, 옛 `scrapeKidkidsOrders`)가 그날 주문을 목록 + 발주서02로
 * 읽는다. 원소는 옛 변환 본문 `{orders}`의 주문 그대로다. 읽기만 한다.
 */
export function createKidkidsSite(tabs: TabPages, signIn?: SiteSignIn) {
  return {
    ...createKidkidsListings(tabs),
    readOrders(input: { collectionDate: string | null }): Promise<{ rows: unknown[] }> {
      return withFreshTab(tabs, KIDKIDS_ORDER_URL, async (page) => {
        const answer = await callPage<KidkidsAnswer>(page, 'kidkids.orders', { dateFilter: input.collectionDate ?? '' }, {
          timeoutMs: READ_TIMEOUT_MS,
          guard: KIDKIDS_PAGE_GUARD,
          isolated: [KIDKIDS_ORDERS_FILE],
          displayName: '키드키즈',
        });
        if (answer?.status === 'ok') return { rows: answer.orders };
        if (answer?.status === 'login_required') throw new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE, { url: KIDKIDS_ORDER_URL });
        throw new RuntimeError(SITE_REQUEST_FAILED, `키드키즈 주문을 읽지 못했습니다: ${answer?.status === 'failed' ? answer.error : '알 수 없음'}`, {
          status: null,
          reason: 'page_error',
          url: KIDKIDS_ORDER_URL,
        });
      }, signIn ? { signIn } : {});
    },
  };
}

registerSite({ name: 'kidkids', create: (deps, lease) => createKidkidsSite(deps.tabs, createSiteSignIn(KIDKIDS_LOGIN, lease.credentials, deps)) });
