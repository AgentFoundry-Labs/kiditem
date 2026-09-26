import { withFreshTab } from '../fresh-tab';
import { mallExcelRows, type MallExcelAnswer } from '../mall-excel';
import { callPage } from '../page-call';
import { registerSite } from '../registry';
import { createSiteSignIn, type LoginSpec, type SiteSignIn } from '../site-login';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';
import { createKkomangseListings } from './listings';

/** 꼬망세(EduPre) 입점관리자 전체주문 — listmaxcount를 크게 두어 검색결과 전부(옛 worker.js `KKOMANGSE_ORDER_URL`). */
export const KKOMANGSE_ORDER_URL =
  'https://nstore.edupre.co.kr/subAdmin/_order_product.list.php?mode=search&pass_input_type=all&st=o_rdate&so=desc&listmaxcount=1000';
export const KKOMANGSE_ORDERS_FILE = 'content/page-call/kkomangse-orders.js';
/** 옛 수집기의 주입 제한 시간. */
const READ_TIMEOUT_MS = 90_000;
const LOGIN_MESSAGE = '꼬망세 로그인이 필요합니다. nstore.edupre.co.kr 에 로그인한 뒤 다시 수집해 주세요.';

export const KKOMANGSE_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['edupre.co.kr']),
  isLogin: (url) => hostWithin(url, ['edupre.co.kr']) && /login/i.test(url.pathname),
  loginMessage: LOGIN_MESSAGE,
};

/** 꼬망세 로그인 입구(옛 `mall-session.js` kkomangse 줄, KID-380). 로그아웃이면 전체주문 목록이 로그인 화면으로 넘긴다. */
export const KKOMANGSE_LOGIN: LoginSpec = {
  displayName: '꼬망세',
  loginUrl: KKOMANGSE_ORDER_URL,
  hosts: ['edupre.co.kr'],
  isLoginUrl: (url) => KKOMANGSE_PAGE_GUARD.isLogin(url),
  fields: ['loginId', 'password'],
};

/**
 * 꼬망세 주문 읽기(KID-380, `orders.mall_orders`, 옛 worker.js `collectKkomangseOrders` 이식). 새 백그라운드 탭에서 전체주문
 * 목록을 열고 ISOLATED 처리기(`content/page-call/kkomangse-orders.js`, 옛 `scrapeKkomangseExport`)가 목록 폼을
 * `_mode=get_search_excel`로 다시 보내 받은 xlsx를 base64로 돌려준다. 서버가 조각을 이어 옛 변환 본문
 * `{xlsxBase64, date}`로 보관한다(날짜 거르기는 변환기가 수집일로 한다). 읽기만 한다.
 */
export function createKkomangseSite(tabs: TabPages, signIn?: SiteSignIn) {
  return {
    ...createKkomangseListings(tabs, signIn),
    readOrders(): Promise<{ rows: unknown[] }> {
      return withFreshTab(tabs, KKOMANGSE_ORDER_URL, async (page) => {
        const answer = await callPage<MallExcelAnswer>(page, 'kkomangse.orders', {}, {
          timeoutMs: READ_TIMEOUT_MS,
          guard: KKOMANGSE_PAGE_GUARD,
          isolated: [KKOMANGSE_ORDERS_FILE],
          displayName: '꼬망세',
        });
        return mallExcelRows(answer, { displayName: '꼬망세', url: KKOMANGSE_ORDER_URL, fileName: 'kkomangse.xlsx' });
      }, signIn ? { signIn } : {});
    },
  };
}

registerSite({ name: 'kkomangse', create: (deps, lease) => createKkomangseSite(deps.tabs, createSiteSignIn(KKOMANGSE_LOGIN, lease.credentials, deps)) });
