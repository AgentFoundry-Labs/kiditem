import { withFreshTab } from '../fresh-tab';
import { mallExcelRows, type MallExcelAnswer } from '../mall-excel';
import { callPage } from '../page-call';
import { registerSite } from '../registry';
import { createSiteSignIn, type LoginSpec, type SiteSignIn } from '../site-login';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

/** 보리보리/하프클럽 협력사(TRICYCLE seller-club) 주문/배송관리(B201). */
export const BORIBORI_ORDER_URL = 'https://seller-club.co.kr/order/orderDeliList';
export const BORIBORI_ORDERS_FILE = 'content/page-call/boribori-orders.js';
/** 몰 상수(옛 worker.js `scrapeBoriboriOrders` 값 그대로): 개인정보 언마스킹 다운로드 사유. */
export const BORIBORI_DOWNLOAD_REASON = '배송확인합니다';
/** 옛 수집기의 주입 제한 시간. */
const READ_TIMEOUT_MS = 120_000;
const LOGIN_MESSAGE = '보리보리 로그인이 필요합니다. seller-club.co.kr 에 로그인한 뒤 다시 수집해주세요.';

export const BORIBORI_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['seller-club.co.kr']),
  isLogin: (url) => hostWithin(url, ['seller-club.co.kr']) && /\/login(?:[/?#.]|$)/i.test(url.pathname),
  loginMessage: LOGIN_MESSAGE,
};

/** 보리보리 로그인 입구(옛 `mall-session.js` boribori 줄, KID-380). 로그아웃이면 주문/배송관리가 `/login`으로 넘긴다(2026-09-16 실측). */
export const BORIBORI_LOGIN: LoginSpec = {
  displayName: '보리보리',
  loginUrl: BORIBORI_ORDER_URL,
  hosts: ['seller-club.co.kr'],
  isLoginUrl: (url) => BORIBORI_PAGE_GUARD.isLogin(url),
  fields: ['loginId', 'password'],
};

/**
 * 보리보리 주문 읽기(KID-380, `orders.mall_orders`, 옛 worker.js `collectBoriboriOrders` 이식). 새 백그라운드 탭에서 주문/배송관리를
 * 열고 MAIN world 처리기(`content/page-call/boribori-orders.js` — ISOLATED는 SameSite 로그인 쿠키를 보내지 않아 404)가
 * 결제완료 60일 주문을 언마스킹 엑셀로 받아 base64로 돌려준다. 다운로드 암호는 옛 웹처럼 몰 계정 비밀번호다
 * (`downloadPassword`, 실행 자격 `lease.credentials.password`) — 이 탭의 페이지 호출 인자로만 가고 plan·progress·결과·청크·
 * 오류에 싣지 않는다(src/README.md 몰 이관 규칙). 없으면 빈 문자열로 사유만 보낸다(옛 규칙).
 */
export function createBoriboriSite(tabs: TabPages, downloadPassword: string, signIn?: SiteSignIn) {
  return {
    readOrders(): Promise<{ rows: unknown[] }> {
      return withFreshTab(tabs, BORIBORI_ORDER_URL, async (page) => {
        const answer = await callPage<MallExcelAnswer>(page, 'boribori.orders', {
          downloadReason: BORIBORI_DOWNLOAD_REASON,
          downloadPassword,
        }, {
          timeoutMs: READ_TIMEOUT_MS,
          guard: BORIBORI_PAGE_GUARD,
          main: [BORIBORI_ORDERS_FILE],
          displayName: '보리보리',
        });
        return mallExcelRows(answer, { displayName: '보리보리', url: BORIBORI_ORDER_URL, fileName: '보리보리.xlsx' });
      }, signIn ? { signIn } : {});
    },
  };
}

registerSite({
  name: 'boribori',
  create: (deps, lease) => createBoriboriSite(
    deps.tabs,
    lease.credentials?.password ?? '',
    createSiteSignIn(BORIBORI_LOGIN, lease.credentials, deps),
  ),
});
