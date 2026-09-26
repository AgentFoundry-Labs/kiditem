import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { withFreshTab } from '../fresh-tab';
import { callPage } from '../page-call';
import { registerSite } from '../registry';
import { createSiteSignIn, type LoginSpec, type SiteSignIn } from '../site-login';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';

/** 입점업체 관리자 주문건수목록. 목록 검색·주문 상세 팝업은 이 화면의 같은 출처 상대 주소다. */
export const HAEBUB_MALL_ORDER_URL = 'https://mallseller.genimarket.co.kr/mall/order/basket_list.php';
export const HAEBUB_MALL_ORDERS_FILE = 'content/page-call/haebub-mall-orders.js';
/**
 * 목록 검색의 "협력사"(우리 공급사명) — 옛 worker.js `HAEBEOP_DEFAULT_VENDOR` 그대로(KID-380 리더 결정: 몰 상수는 사이트 모듈
 * 상수). 고객사(search_shop_name)와 혼동 주의 — 거기 넣으면 0건이다.
 */
export const HAEBUB_MALL_VENDOR = '거영아이앤디';
/** 옛 수집기의 주입 제한 시간(주문마다 상세 팝업을 읽는다). */
const READ_TIMEOUT_MS = 180_000;
const LOGIN_MESSAGE = '해법몰 로그인이 필요합니다. mallseller.genimarket.co.kr 에 로그인한 뒤 다시 수집해 주세요.';
const HOSTS = ['genimarket.co.kr'];

/** 주소에 login이 든 해법몰 화면(옛 수집기의 로그인 판정 `/login/i.test(location.href)`와 같다). */
const isHaebubLogin = (url: URL) => hostWithin(url, HOSTS) && /login/i.test(url.pathname + url.search);

export const HAEBUB_MALL_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, HOSTS),
  isLogin: isHaebubLogin,
  loginMessage: LOGIN_MESSAGE,
};

/** 해법몰 로그인 입구(옛 `mall-session.js` haebub-mall 줄: entry = login = 주문건수목록). */
export const HAEBUB_MALL_LOGIN: LoginSpec = {
  displayName: '해법몰',
  loginUrl: HAEBUB_MALL_ORDER_URL,
  hosts: HOSTS,
  isLoginUrl: isHaebubLogin,
  fields: ['loginId', 'password'],
};

type HaebubMallAnswer =
  | { status: 'ok'; orders: unknown[] }
  | { status: 'login_required' }
  | { status: 'failed'; error: string };

/**
 * 해법몰(제니마켓 mallseller) 주문 읽기(KID-380, `orders.mall_orders`). 새 백그라운드 탭에서 주문건수목록을 열어 ISOLATED
 * 처리기(`content/page-call/haebub-mall-orders.js`, 옛 `scrapeHaebeopOrders`)가 수집일의 결제완료 주문을 목록 전 쪽 +
 * 주문별 상세 팝업으로 읽는다(엑셀은 암호 ZIP이라 쓰지 않는다). 원소는 옛 변환 본문 `{orders}`의 상품행 그대로다. 그날을
 * 다 봤다는 확인(기간)은 서버가 수집일로 적는다 — 상세 하나라도 못 읽거나 쪽 상한을 넘으면 실패라 확인도 없다. 읽기만 한다.
 */
export function createHaebubMallSite(tabs: TabPages, signIn?: SiteSignIn) {
  return {
    readOrders(input: { collectionDate: string | null }): Promise<{ rows: unknown[] }> {
      return withFreshTab(tabs, HAEBUB_MALL_ORDER_URL, async (page) => {
        const answer = await callPage<HaebubMallAnswer>(page, 'haebub-mall.orders', { date: input.collectionDate ?? '', vendor: HAEBUB_MALL_VENDOR }, {
          timeoutMs: READ_TIMEOUT_MS,
          guard: HAEBUB_MALL_PAGE_GUARD,
          isolated: [HAEBUB_MALL_ORDERS_FILE],
          displayName: '해법몰',
        });
        if (answer?.status === 'ok') return { rows: answer.orders };
        if (answer?.status === 'login_required') throw new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE, { url: HAEBUB_MALL_ORDER_URL });
        throw new RuntimeError(SITE_REQUEST_FAILED, `해법몰 주문을 읽지 못했습니다: ${answer?.status === 'failed' ? answer.error : '알 수 없음'}`, {
          status: null,
          reason: 'page_error',
          url: HAEBUB_MALL_ORDER_URL,
        });
      }, signIn ? { signIn } : {});
    },
  };
}

registerSite({ name: 'haebub-mall', create: (deps, lease) => createHaebubMallSite(deps.tabs, createSiteSignIn(HAEBUB_MALL_LOGIN, lease.credentials, deps)) });
