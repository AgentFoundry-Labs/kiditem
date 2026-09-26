import { RuntimeError, isRuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED } from '../../core/site-caller';
import { withFreshTab } from '../fresh-tab';
import { mallExcelRows, type MallExcelAnswer } from '../mall-excel';
import { callPage } from '../page-call';
import { registerSite } from '../registry';
import { createSiteSignIn, type LoginSpec, type SiteSignIn } from '../site-login';
import { hostWithin, waitForOperator, type AttentionListener, type PageGuard, type SiteAttention, type TabPage, type TabPages } from '../tab-page';

/** GS샵 협력사 배송관리 — 서버 엑셀 주소가 없고, 다운로드를 누르면 화면이 xlsx를 조립해 `URL.createObjectURL`로 내려준다. */
export const GS_SHOP_ORDER_URL = 'https://partners.gsshop.com/logistics/partner-logistics-mng';
export const GS_SHOP_ORDERS_FILE = 'content/page-call/gs-shop-orders.js';
/** 옛 수집기의 주입 제한 시간(조회 + 상세 fetch + 클라이언트 엑셀 조립). */
const READ_TIMEOUT_MS = 140_000;
const WALL_TIMEOUT_MS = 10_000;
const NAVIGATION_TIMEOUT_MS = 30_000;
const LOGIN_MESSAGE = 'GS샵 로그인이 필요합니다. 로그인한 뒤 다시 수집해주세요.';
const SMS_MESSAGE = "GS샵 SMS 인증이 필요합니다. GS샵 협력사 로그인에서 [인증번호 받기]로 인증을 완료한 뒤 다시 '수집하기'를 눌러주세요.";
const OPERATOR_ACTION_REQUIRED = 'OPERATOR_ACTION_REQUIRED' as const;
const SMS_ATTENTION: SiteAttention = { kind: 'verification', site: 'gs-shop', label: 'SMS 인증' };

const isGsShopLogin = (url: URL) => hostWithin(url, ['gsshop.com']) && /\/(?:sign-?in|login)(?:[/?#.]|$)/i.test(url.pathname);

export const GS_SHOP_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['partners.gsshop.com']),
  isLogin: isGsShopLogin,
  loginMessage: LOGIN_MESSAGE,
};

/** SMS 화면을 살필 때의 guard — 로그인 화면도 읽을 곳이다. */
const WALL_GUARD: PageGuard = { ...GS_SHOP_PAGE_GUARD, isLogin: () => false };

/** GS샵 로그인 입구(옛 `mall-session.js` gs-shop 줄, KID-380). 로그아웃이면 배송관리가 `/sign-in`으로 넘긴다(2026-09-16 실측). */
export const GS_SHOP_LOGIN: LoginSpec = {
  displayName: 'GS샵',
  loginUrl: GS_SHOP_ORDER_URL,
  hosts: ['partners.gsshop.com'],
  isLoginUrl: isGsShopLogin,
  fields: ['loginId', 'password'],
};

function isLoginRequired(error: unknown): boolean {
  return isRuntimeError(error) && error.code === SITE_LOGIN_REQUIRED;
}

/**
 * GS샵 주문 읽기(KID-380, `orders.mall_orders`, 옛 worker.js `collectGsshopOrders` 이식). 새 백그라운드 탭에서 배송관리를 열고
 * MAIN world 처리기(`content/page-call/gs-shop-orders.js` — `createObjectURL`을 가로채고 React 화면을 눌러야 한다)가 1주일 조회 →
 * 총주문 → 다운로드 → 조립된 xlsx blob을 base64로 돌려준다. 조회 0건은 빈 수집이다. 읽기만 한다.
 *
 * SMS 인증(협력사 로그인의 [인증번호 받기])은 옛 수집기처럼 실패로 끝내지 않고 `waitForOperator`로 멈췄다 잇는다: 배송관리가
 * SMS 화면을 보이거나, 로그인 화면이 SMS 인증번호를 받는 화면이면 운영자에게 알리고(`onAttention` → progress.attention) 탭이
 * 그 화면을 벗어나면 배송관리로 돌아가 한 번 더 읽는다. 10분 안에 벗어나지 않으면 OPERATOR_ACTION_REQUIRED. SMS가 아닌
 * 로그인 화면은 SITE_LOGIN_REQUIRED(실행 자격이 있으면 로그인 문턱이 한 번 로그인한다 — 그 뒤 SMS 화면이 오면 여기서 기다린다).
 */
export function createGsShopSite(tabs: TabPages, signIn?: SiteSignIn) {
  const orders = (page: TabPage) => callPage<MallExcelAnswer>(page, 'gs-shop.orders', {}, {
    timeoutMs: READ_TIMEOUT_MS,
    guard: GS_SHOP_PAGE_GUARD,
    main: [GS_SHOP_ORDERS_FILE],
    displayName: 'GS샵',
  });
  const smsWall = (page: TabPage) => callPage<{ sms?: boolean }>(page, 'gs-shop.smsWall', {}, {
    timeoutMs: WALL_TIMEOUT_MS,
    guard: WALL_GUARD,
    main: [GS_SHOP_ORDERS_FILE],
    displayName: 'GS샵',
  }).catch(() => null);

  async function read(page: TabPage, onAttention?: AttentionListener): Promise<{ rows: unknown[] }> {
    let waited = false;
    const waitSms = async (message: string) => {
      const wallUrl = await page.currentUrl();
      const blocked = (value: string) => {
        if (value === wallUrl) return true;
        try {
          return isGsShopLogin(new URL(value));
        } catch {
          return false;
        }
      };
      if (!(await waitForOperator(page, blocked, SMS_ATTENTION, onAttention))) {
        throw new RuntimeError(OPERATOR_ACTION_REQUIRED, message, { url: GS_SHOP_ORDER_URL });
      }
      waited = true;
      await page.navigate(GS_SHOP_ORDER_URL, { timeoutMs: NAVIGATION_TIMEOUT_MS });
    };
    for (;;) {
      let answer: MallExcelAnswer;
      try {
        answer = await orders(page);
      } catch (error) {
        if (!isLoginRequired(error) || waited || (await smsWall(page))?.sms !== true) throw error;
        await waitSms(SMS_MESSAGE);
        continue;
      }
      if (answer?.pendingAuth === true && !waited) {
        await waitSms(answer.error || SMS_MESSAGE);
        continue;
      }
      return mallExcelRows(answer, { displayName: 'GS샵', url: GS_SHOP_ORDER_URL, fileName: 'GS샵.xlsx' });
    }
  }

  return {
    readOrders(input: { onAttention?: AttentionListener } = {}): Promise<{ rows: unknown[] }> {
      return withFreshTab(tabs, GS_SHOP_ORDER_URL, (page) => read(page, input.onAttention), signIn ? { signIn } : {});
    },
  };
}

registerSite({ name: 'gs-shop', create: (deps, lease) => createGsShopSite(deps.tabs, createSiteSignIn(GS_SHOP_LOGIN, lease.credentials, deps)) });
