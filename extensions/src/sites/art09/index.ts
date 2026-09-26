import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { withFreshTab } from '../fresh-tab';
import { callPage } from '../page-call';
import { registerSite } from '../registry';
import { createSiteSignIn, type LoginSpec, type SiteSignIn } from '../site-login';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';
import { createArt09Listings } from './listings';

/** Cafe24 공급사 관리자 주문목록. 배송정보 상세는 이 화면의 같은 출처 상대 주소다. */
export const ART09_ORDER_URL = 'https://zzogzzog1.cafe24.com/admin/php/shop1/s_new/order_list.php?1&shop_no=1';
export const ART09_ORDERS_FILE = 'content/orders/art09-orders.js';
/** 옛 수집기의 주입 제한 시간(주문마다 상세를 읽는다). */
const READ_TIMEOUT_MS = 180_000;
const LOGIN_MESSAGE = '아트공구 로그인이 필요합니다. zzogzzog1.cafe24.com 에 로그인한 뒤 다시 수집해주세요.';

/**
 * 아트공구 탭이 있어도 되는 곳. Cafe24는 로그인된 화면에도 '로그인' 글자·비밀번호 칸이 있어, 주문목록에 머물렀는지로만
 * 로그인을 가린다(mall-session.js의 art09 규칙과 같다).
 */
export const ART09_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['zzogzzog1.cafe24.com']),
  isLogin: (url) => hostWithin(url, ['cafe24.com']) && !/order_list\.php$/i.test(url.pathname),
  loginMessage: LOGIN_MESSAGE,
};

/**
 * 아트공구 로그인 입구(옛 `mall-session.js` art09 줄, KID-377). Cafe24는 쇼핑몰 아이디와 공급사(운영자) 아이디를 따로
 * 받아 세 칸이다. 로그인 화면은 주문목록에 머물지 못한 Cafe24 화면이다(수집 guard와 같은 규칙).
 */
export const ART09_LOGIN: LoginSpec = {
  displayName: '아트공구',
  loginUrl: ART09_ORDER_URL,
  hosts: ['zzogzzog1.cafe24.com'],
  isLoginUrl: (url) => ART09_PAGE_GUARD.isLogin(url),
  fields: ['supplierLoginId', 'loginId', 'password'],
};

type Art09Answer =
  | { status: 'ok'; rows: unknown[]; failures: string[] }
  | { status: 'login_required' }
  | { status: 'failed'; error: string };

/**
 * 아트공구(Cafe24 공급사) 주문 읽기(KID-359 H3, `orders.mall_orders`). 새 백그라운드 탭에서 주문목록을 열어 ISOLATED
 * 처리기(`content/orders/art09-orders.js`, 옛 `scrapeArt09Orders`)가 그날 배송준비전 주문의 배송정보를 읽는다. 원소는
 * 옛 변환 본문 `{rows}`의 Cafe24 CSV 행 그대로다. 일부 주문 상세만 실패하면 읽은 행으로 끝난다(옛 규칙).
 */
export function createArt09Site(tabs: TabPages, signIn?: SiteSignIn) {
  return {
    ...createArt09Listings(tabs),
    readOrders(input: { collectionDate: string | null }): Promise<{ rows: unknown[] }> {
      return withFreshTab(tabs, ART09_ORDER_URL, async (page) => {
        const answer = await callPage<Art09Answer>(page, 'art09.orders', { dateFilter: input.collectionDate ?? '' }, {
          timeoutMs: READ_TIMEOUT_MS,
          guard: ART09_PAGE_GUARD,
          isolated: [ART09_ORDERS_FILE],
          displayName: '아트공구',
        });
        if (answer?.status === 'ok') return { rows: answer.rows };
        if (answer?.status === 'login_required') throw new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE, { url: ART09_ORDER_URL });
        throw new RuntimeError(SITE_REQUEST_FAILED, `아트공구 주문을 읽지 못했습니다: ${answer?.status === 'failed' ? answer.error : '알 수 없음'}`, {
          status: null,
          reason: 'page_error',
          url: ART09_ORDER_URL,
        });
      }, signIn ? { signIn } : {});
    },
  };
}

registerSite({ name: 'art09', create: (deps, lease) => createArt09Site(deps.tabs, createSiteSignIn(ART09_LOGIN, lease.credentials, deps)) });
