import { withFreshTab } from '../fresh-tab';
import { mallExcelRows, type MallExcelAnswer } from '../mall-excel';
import { callPage } from '../page-call';
import { registerSite } from '../registry';
import { createSiteSignIn, type LoginSpec, type SiteSignIn } from '../site-login';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

/** 티쳐몰(퍼스트몰 selleradmin) 입점사배송 주문상품 리스트 — 엑셀 폼(excel_down_form)이 이 화면에만 있다. */
export const TEACHER_MALL_ORDER_URL = 'https://shop.teacherville.co.kr/selleradmin/order/catalog';
export const TEACHER_MALL_ORDERS_FILE = 'content/page-call/teacher-mall-orders.js';
/**
 * 몰 상수(옛 worker.js `scrapeTeachervilleOrders` 값 그대로, KID-380 결정 #5): 엑셀 양식 117(티쳐몰 주문서 — 이 양식이어야
 * 데이터가 나온다), 폼에 입점사 seq가 없을 때의 입점사 708, 개인정보 다운로드 사유.
 */
export const TEACHER_MALL_EXCEL_TEMPLATE_SEQ = '117';
export const TEACHER_MALL_PROVIDER_SEQ = '708';
export const TEACHER_MALL_DOWNLOAD_REASON = '배송준비확인';
/** 옛 수집기의 주입 제한 시간. */
const READ_TIMEOUT_MS = 120_000;
const LOGIN_MESSAGE = '티쳐몰 로그인이 필요합니다. selleradmin에 로그인한 뒤 다시 수집해주세요.';

export const TEACHER_MALL_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['teacherville.co.kr']),
  isLogin: (url) => hostWithin(url, ['teacherville.co.kr']) && /login/i.test(url.pathname),
  loginMessage: LOGIN_MESSAGE,
};

/** 티쳐몰 로그인 입구(옛 `mall-session.js` teacher-mall 줄, KID-380). 로그아웃이면 주문상품 목록이 로그인 화면으로 넘긴다. */
export const TEACHER_MALL_LOGIN: LoginSpec = {
  displayName: '티쳐몰',
  loginUrl: TEACHER_MALL_ORDER_URL,
  hosts: ['teacherville.co.kr'],
  isLoginUrl: (url) => TEACHER_MALL_PAGE_GUARD.isLogin(url),
  fields: ['loginId', 'password'],
};

/**
 * 티쳐몰 주문 읽기(KID-380, `orders.mall_orders`, 옛 worker.js `collectTeachervilleOrders` 이식). 새 백그라운드 탭에서 주문상품
 * 목록을 열고 MAIN world 처리기(`content/page-call/teacher-mall-orders.js` — 페이지의 jQuery·세션 쿠키로 요청한다)가 출고 전
 * 행(25·35·40·45)만 골라 `order_process/excel_down`으로 셀피아 양식 SpreadsheetML을 받아 base64로 돌려준다. 출고 전 행이 없는
 * 인증된 목록은 빈 수집이다. 읽기만 한다(다운로드 사유 기록은 몰의 개인정보 다운로드 절차다).
 */
export function createTeacherMallSite(tabs: TabPages, signIn?: SiteSignIn) {
  return {
    readOrders(): Promise<{ rows: unknown[] }> {
      return withFreshTab(tabs, TEACHER_MALL_ORDER_URL, async (page) => {
        const answer = await callPage<MallExcelAnswer>(page, 'teacher-mall.orders', {
          templateSeq: TEACHER_MALL_EXCEL_TEMPLATE_SEQ,
          fallbackProviderSeq: TEACHER_MALL_PROVIDER_SEQ,
          downloadReason: TEACHER_MALL_DOWNLOAD_REASON,
        }, {
          timeoutMs: READ_TIMEOUT_MS,
          guard: TEACHER_MALL_PAGE_GUARD,
          main: [TEACHER_MALL_ORDERS_FILE],
          displayName: '티쳐몰',
        });
        return mallExcelRows(answer, { displayName: '티쳐몰', url: TEACHER_MALL_ORDER_URL, fileName: '티쳐몰.xls' });
      }, signIn ? { signIn } : {});
    },
  };
}

registerSite({ name: 'teacher-mall', create: (deps, lease) => createTeacherMallSite(deps.tabs, createSiteSignIn(TEACHER_MALL_LOGIN, lease.credentials, deps)) });
