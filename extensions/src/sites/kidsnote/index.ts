import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { withFreshTab } from '../fresh-tab';
import { callPage } from '../page-call';
import { registerSite } from '../registry';
import { createSiteSignIn, type LoginSpec, type SiteSignIn } from '../site-login';
import { hostWithin, type PageGuard, type TabPages } from '../tab-page';
import { createKidsnoteListings } from './listings';

/** 전체주문조회(WISA 관리자). 목록·주문서 인쇄·주문보기는 이 화면의 같은 출처 상대 주소다. */
export const KIDSNOTE_ORDER_URL = 'https://shop.kidsnote.com/_manage/?body=3010';
export const KIDSNOTE_ORDERS_FILE = 'content/page-call/kidsnote-orders.js';
/** 옛 수집기의 주입 제한 시간(주문마다 인쇄·주문보기 두 화면을 읽는다). */
const READ_TIMEOUT_MS = 190_000;
const LOGIN_MESSAGE = 'shop.kidsnote.com 관리자 로그인이 필요합니다. 로그인 후 다시 시도하세요.';
const HOSTS = ['shop.kidsnote.com'];

/** 경로에 login으로 시작하는 마디가 있는 키즈노트 화면(예: /member/login.php). 쿼리의 login은 보지 않는다. */
const isKidsnoteLogin = (url: URL) => hostWithin(url, HOSTS) && /\/login/i.test(url.pathname);

export const KIDSNOTE_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, HOSTS),
  isLogin: isKidsnoteLogin,
  loginMessage: LOGIN_MESSAGE,
};

/**
 * 키즈노트 로그인 입구(옛 `mall-session.js` kidsnote 줄: entry = login = 전체주문조회). 로그아웃이면 관리자 화면이 로그인
 * 폼을 보이고, 읽기는 목록 표 대신 로그인 화면을 받아 `login_required`로 답한다 — 그 탭에서 폼을 채운다.
 */
export const KIDSNOTE_LOGIN: LoginSpec = {
  displayName: '키즈노트',
  loginUrl: KIDSNOTE_ORDER_URL,
  hosts: HOSTS,
  isLoginUrl: isKidsnoteLogin,
  fields: ['loginId', 'password'],
};

/** 페이지 스크립트가 읽은 주문(옛 `scrapeKidsnoteOrders`의 원소). */
interface KidsnoteScrapedOrder {
  ono: string;
  orderedAt?: string;
  paidAt?: string;
  ordererName?: string;
  totalAmount?: number;
  paidAmount?: number;
  payMethod?: string;
  status?: string;
  productName?: string;
  receiver?: string;
  mobile?: string;
  tel?: string;
  zip?: string;
  address?: string;
  request?: string;
  items?: unknown[];
}

type KidsnoteAnswer =
  | { status: 'ok'; orders: KidsnoteScrapedOrder[] }
  | { status: 'login_required' }
  | { status: 'failed'; error: string };

/**
 * 키즈노트 변환 본문 `{orders}`의 주문 하나 — 옛 확장 `order-collection-server-converter.js` `kidsnotePayload` 그대로.
 * 서버 변환기(`convertKidsnoteOrders`)가 받는 이름이다.
 */
export function kidsnoteConvertOrder(order: KidsnoteScrapedOrder) {
  return {
    ono: order.ono,
    orderedAt: order.orderedAt,
    paidAt: order.paidAt ?? '',
    buyer: order.ordererName,
    total: order.totalAmount,
    paid: order.paidAmount,
    payMethod: order.payMethod,
    status: order.status,
    receiver: order.receiver || order.ordererName,
    mobile: order.mobile ?? '',
    tel: order.tel ?? '',
    zip: order.zip ?? '',
    address: order.address ?? '',
    request: order.request ?? '',
    items: order.items?.length
      ? order.items
      : [{ productName: order.productName, qty: 1, option: '', shipFee: 0 }],
  };
}

/**
 * 키즈노트(shop.kidsnote.com) 주문 읽기(KID-380, `orders.mall_orders`). 새 백그라운드 탭에서 전체주문조회를 열어 ISOLATED
 * 처리기(`content/page-call/kidsnote-orders.js`, 옛 `scrapeKidsnoteOrders`)가 그날 주문을 목록 + 주문서 인쇄 + 주문보기로
 * 읽는다(옛 웹이 보내던 `withDetail: true`, 상태 필터 없음). 읽기만 한다.
 */
export function createKidsnoteSite(tabs: TabPages, signIn?: SiteSignIn) {
  return {
    ...createKidsnoteListings(tabs, signIn),
    readOrders(input: { collectionDate: string | null }): Promise<{ rows: unknown[] }> {
      return withFreshTab(tabs, KIDSNOTE_ORDER_URL, async (page) => {
        const day = input.collectionDate ?? '';
        const answer = await callPage<KidsnoteAnswer>(page, 'kidsnote.orders', { from: day, to: day, status: '', withDetail: true }, {
          timeoutMs: READ_TIMEOUT_MS,
          guard: KIDSNOTE_PAGE_GUARD,
          isolated: [KIDSNOTE_ORDERS_FILE],
          displayName: '키즈노트',
        });
        if (answer?.status === 'ok') return { rows: answer.orders.map(kidsnoteConvertOrder) };
        if (answer?.status === 'login_required') throw new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE, { url: KIDSNOTE_ORDER_URL });
        throw new RuntimeError(SITE_REQUEST_FAILED, `키즈노트 주문을 읽지 못했습니다: ${answer?.status === 'failed' ? answer.error : '알 수 없음'}`, {
          status: null,
          reason: 'page_error',
          url: KIDSNOTE_ORDER_URL,
        });
      }, signIn ? { signIn } : {});
    },
  };
}

registerSite({ name: 'kidsnote', create: (deps, lease) => createKidsnoteSite(deps.tabs, createSiteSignIn(KIDSNOTE_LOGIN, lease.credentials, deps)) });
