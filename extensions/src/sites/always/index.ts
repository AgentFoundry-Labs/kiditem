import { withFreshTab } from '../fresh-tab';
import { mallExcelRows, type MallExcelAnswer } from '../mall-excel';
import { callPage } from '../page-call';
import { registerSite } from '../registry';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

/** 올웨이즈 판매자센터 배송관리 — "팀모집완료(엑셀추출 이전)" 주문을 앱이 xlsx로 조립해 `URL.createObjectURL`로 내려준다. */
export const ALWAYS_ORDER_URL = 'https://alwayzseller.ilevit.com/shippings';
export const ALWAYS_ORDERS_FILE = 'content/page-call/always-orders.js';
/** 옛 수집기의 주입 제한 시간. */
const READ_TIMEOUT_MS = 120_000;
const LOGIN_MESSAGE = '올웨이즈 로그인이 필요합니다. 열린 올웨이즈 탭에서 로그인한 뒤 다시 수집해주세요.';

/**
 * 올웨이즈 탭이 있어도 되는 곳. 로그인은 브라우저 저장소 JWT라 채울 로그인 폼 명세가 없다(옛 `mall-session.js` always 줄
 * `fields: null`, KID-380 결정 #3) — 로그인 화면이면 SITE_LOGIN_REQUIRED로 멈추고 탭을 남겨 운영자가 로그인한다.
 */
export const ALWAYS_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['alwayzseller.ilevit.com']),
  isLogin: (url) => hostWithin(url, ['alwayzseller.ilevit.com']) && /\/login(?:[/?#.]|$)/i.test(url.pathname),
  loginMessage: LOGIN_MESSAGE,
};

/**
 * 올웨이즈 주문 읽기(KID-380, `orders.mall_orders`, 옛 worker.js `collectAlwayzOrders` 이식). 새 백그라운드 탭에서 배송관리를
 * 열고 MAIN world 처리기(`content/page-call/always-orders.js` — `createObjectURL`을 가로채고 앱 화면을 눌러야 한다)가
 * pre-excel API로 신규 주문 수를 보고(0이면 빈 수집) 엑셀추출하기로 조립된 xlsx blob을 base64로 돌려준다. 판매자 토큰은
 * 그 페이지 안에서만 쓴다. 로그인 문턱이 없다(`loginSpec` 없음) — 저장 자격은 쓰지 않는다. 읽기만 한다.
 */
export function createAlwaysSite(tabs: TabPages) {
  return {
    readOrders(): Promise<{ rows: unknown[] }> {
      return withFreshTab(tabs, ALWAYS_ORDER_URL, async (page) => {
        const answer = await callPage<MallExcelAnswer>(page, 'always.orders', {}, {
          timeoutMs: READ_TIMEOUT_MS,
          guard: ALWAYS_PAGE_GUARD,
          main: [ALWAYS_ORDERS_FILE],
          displayName: '올웨이즈',
        });
        return mallExcelRows(answer, { displayName: '올웨이즈', url: ALWAYS_ORDER_URL, fileName: '올웨이즈.xlsx' });
      });
    },
  };
}

registerSite({ name: 'always', create: (deps) => createAlwaysSite(deps.tabs) });
