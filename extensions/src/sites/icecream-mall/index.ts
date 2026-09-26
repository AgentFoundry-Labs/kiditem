import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { withFreshTab } from '../fresh-tab';
import { callPage } from '../page-call';
import { registerSite } from '../registry';
import { createSiteSignIn, type LoginSpec, type SiteSignIn } from '../site-login';
import { hostWithin, type PageGuard, type TabPage, type TabPages } from '../tab-page';

export const ICECREAM_MALL_URL = 'https://po.i-screammall.co.kr/main.do';
export const ICECREAM_FRAMES_FILE = 'content/orders/icecream-frames.js';
export const ICECREAM_MENU_FILE = 'content/orders/icecream-menu.js';
export const ICECREAM_GRID_FILE = 'content/orders/icecream-delivery-grid.js';
/** main.do → loginForm.do 리다이렉트는 JS라 늦게 뜬다 — 이 동안 로그인 폼이 보이는지 본다. */
const LOGIN_WATCH_ROUNDS = 16;
const LOGIN_WATCH_MS = 500;
/** 옛 수집기의 제한 시간: 배송조회 이동 45초(백그라운드 탭 여럿과 함께 돌면 15초가 모자랐다), 배송목록 35초. */
const MENU_TIMEOUT_MS = 45_000;
const GRID_TIMEOUT_MS = 35_000;
const LOGIN_MESSAGE = '아이스크림몰 로그인이 필요합니다. 열려 있는 아이스크림몰 탭에서 로그인한 뒤 다시 수집해 주세요.';

export const ICECREAM_DELIVERY_HEADERS: readonly string[] = [
  'No',
  '주문번호',
  '배송번호',
  '사이트',
  '주문완료일시',
  '주문구분',
  '주문내역구분',
  '주문내역상태',
  '배송유형',
  '배송종류',
  '배송처리유형',
  '택배사',
  '송장번호',
  '배송조회',
  '주문판매유형',
  '거래명세서동봉여부',
  '합배송여부',
  '직배변경 사유',
  '상품번호',
  '상품명',
  '단품명',
  '출고수량',
  '추가입력옵션',
  '증정품',
  '정상가',
  '판매가',
  '판매가(합계)',
  '공급가',
  '공급가(합계)',
  '배송비',
  'Y주문번호',
  '입점사',
  '회원ID',
  '주문자',
  '수취인',
  '수취인휴대폰번호',
  '우편번호',
  '배송지',
  '배송요청사항',
  '배송지시일시',
  '출고지시일시',
  '출고완료일시',
];
export const ICECREAM_EXCLUDED_DELIVERY_STATUSES: readonly string[] = [
  '출고완료',
  '배송중',
  '배송완료',
  '구매확정',
  '반품접수',
  '회수지시',
  '회수확인',
  '회수완료',
];

export const ICECREAM_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['i-screammall.co.kr']),
  isLogin: (url) => hostWithin(url, ['i-screammall.co.kr']) && /login/i.test(url.pathname),
  loginMessage: LOGIN_MESSAGE,
};

/**
 * 아이스크림몰 로그인 입구(옛 `mall-session.js` icecream-mall 줄, KID-377). main.do → loginForm.do 리다이렉트가 JS라 늦게
 * 뜨므로 폼 없는 화면이 8초(옛 로그인 살피기 16×500ms) 이어져야 '폼 없음'이다. 로그인 폼은 프레임에 뜰 수 있다.
 */
export const ICECREAM_LOGIN: LoginSpec = {
  displayName: '아이스크림몰',
  loginUrl: ICECREAM_MALL_URL,
  hosts: ['i-screammall.co.kr'],
  isLoginUrl: (url) => ICECREAM_PAGE_GUARD.isLogin(url),
  fields: ['loginId', 'password'],
  settleMs: LOGIN_WATCH_ROUNDS * LOGIN_WATCH_MS,
};

/** 배송목록을 못 읽은 까닭(페이지 스크립트의 진단). */
export interface IcecreamGridDiagnosis {
  reason?: string;
  headerCount?: number;
  candidateRows?: number;
  orderRows?: number;
  doneExcluded?: number;
}

type FrameInspection = { loginPage?: boolean; deliveryScore?: number; deliveryMenu?: boolean };
type MenuAnswer = { status: 'opened' } | { status: 'login_required' } | { status: 'failed'; error: string };
type GridOk = { status: 'ok'; headers: string[]; rows: string[][]; masked?: boolean };
type GridAnswer = GridOk | ({ status: 'none' } & IcecreamGridDiagnosis);

/**
 * 출고 전 주문이 하나도 없는 날인가 — 표는 읽었는데 주문번호 행이 없거나(나머지는 화면 틀·검색 조건) 있던 주문이 전부
 * 이미 출고·완료다. 실패가 아니라 신규 주문 없음이다(2026-09-18: 주문 없는 한 주가 실패 몰로 셌다, 옛 규칙 그대로).
 */
export function icecreamHasNoPendingOrders(diagnosis: IcecreamGridDiagnosis): boolean {
  if (diagnosis.reason !== 'data rows not found') return false;
  const orderRows = diagnosis.orderRows ?? 0;
  if (orderRows === 0) return (diagnosis.candidateRows ?? 0) > 0;
  return (diagnosis.doneExcluded ?? 0) >= orderRows;
}

/** 못 읽은 까닭을 운영자 문장으로(옛 `summarizeScrapeFailures`). */
export function icecreamGridFailureMessage(diagnosis: IcecreamGridDiagnosis): string {
  if (diagnosis.reason === 'data rows not found') {
    if ((diagnosis.candidateRows ?? 0) > 0) {
      return `배송목록 표(${diagnosis.candidateRows}행)는 찾았지만 주문번호(YYYYMMDDM…) 형식의 주문이 없습니다. 주문번호가 마스킹되어 있을 수 있습니다.`;
    }
    return '배송목록 표는 찾았지만 주문 행을 찾지 못했습니다. 조회 결과를 확인해주세요.';
  }
  if (diagnosis.reason === 'header not found') {
    return '배송조회 화면은 열었지만 배송목록 표 머리글을 찾지 못했습니다. 표가 로딩된 뒤 다시 시도해주세요.';
  }
  if (diagnosis.reason === 'not delivery inquiry frame') return '배송조회 화면은 열었지만 수집 가능한 배송조회 프레임을 찾지 못했습니다.';
  return '아이스크림몰 배송조회 화면은 열었지만 배송목록 표를 찾지 못했습니다.';
}

function loginRequired(): RuntimeError {
  return new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE, { url: ICECREAM_MALL_URL });
}

/**
 * 아이스크림몰(po.i-screammall.co.kr) 주문 읽기(KID-359 H3, `orders.mall_orders`, 옛 worker.js `collectIcecreamMallOrders`
 * 이식). 새 백그라운드 탭에서 main.do를 열고, 로그인 폼이 보이면 실행의 저장 자격으로 그 탭에서 한 번 로그인하고
 * main.do로 돌아가 다시 읽는다(KID-377, `ICECREAM_LOGIN`). 자격이 없거나 그래도 로그인 화면이면 SITE_LOGIN_REQUIRED. '배송 조회'를 열고(ISOLATED, 맨 위 문서) 모든
 * 프레임을 살펴 배송조회 프레임을 고른 뒤 그 프레임에서 MAIN world로 최근 30일 출고 전 주문 행을 읽는다. 행과 머리글
 * (continuation)을 돌려주고, 자동 선택(본 행 빼기)은 서버가 plan의 본 행 키로 한다.
 */
export function createIcecreamMallSite(tabs: TabPages, sleep: (ms: number) => Promise<void>, signIn?: SiteSignIn) {
  async function inspect(page: TabPage): Promise<Array<{ frameId: number; result: FrameInspection }>> {
    return page.frames<FrameInspection>([ICECREAM_FRAMES_FILE]);
  }

  return {
    readOrders(input: { collectionDate: string | null }): Promise<{ rows: unknown[]; continuation?: Record<string, unknown> }> {
      return withFreshTab(tabs, ICECREAM_MALL_URL, async (page) => {
        // 로그인 화면이 JS로 늦게 뜨므로 잠시 살핀다 — 배송 메뉴(또는 배송조회 화면)가 보이면 로그인된 것이라 곧바로 끝낸다.
        for (let round = 0; round < LOGIN_WATCH_ROUNDS; round += 1) {
          const frames = await inspect(page);
          if (frames.some((frame) => frame.result.loginPage)) throw loginRequired();
          if (frames.some((frame) => frame.result.deliveryMenu || (frame.result.deliveryScore ?? 0) > 0)) break;
          await sleep(LOGIN_WATCH_MS);
        }
        const menu = await callPage<MenuAnswer>(page, 'icecream.openDeliveryInquiry', {}, {
          timeoutMs: MENU_TIMEOUT_MS,
          guard: ICECREAM_PAGE_GUARD,
          isolated: [ICECREAM_MENU_FILE],
          displayName: '아이스크림몰',
        });
        if (menu?.status === 'login_required') throw loginRequired();
        if (menu?.status !== 'opened') {
          throw new RuntimeError(SITE_REQUEST_FAILED, menu?.status === 'failed' ? menu.error : '아이스크림몰 배송조회 화면을 열지 못했습니다.', {
            status: null,
            reason: 'page_error',
            url: ICECREAM_MALL_URL,
          });
        }
        const inspected = await inspect(page);
        const scored = inspected
          .filter((frame) => (frame.result.deliveryScore ?? 0) > 0)
          .sort((a, b) => (b.result.deliveryScore ?? 0) - (a.result.deliveryScore ?? 0));
        // 배송조회 프레임이 점수로 가려지면 그 프레임만, 아니면 모든 프레임에서 읽고 가장 나은 답을 쓴다(옛 allFrames 폴백).
        const targets = scored.length > 0 ? [scored[0]!.frameId] : [...new Set([0, ...inspected.map((frame) => frame.frameId)])];
        const answers: GridAnswer[] = [];
        for (const frameId of targets) {
          answers.push(await callPage<GridAnswer>(page, 'icecream.deliveryGrid', {
            date: input.collectionDate,
            headers: ICECREAM_DELIVERY_HEADERS,
            excludedStatuses: ICECREAM_EXCLUDED_DELIVERY_STATUSES,
          }, {
            timeoutMs: GRID_TIMEOUT_MS,
            guard: ICECREAM_PAGE_GUARD,
            main: [ICECREAM_GRID_FILE],
            displayName: '아이스크림몰',
            frameId,
          }));
        }
        const grid: GridAnswer | undefined = answers
          .filter((answer): answer is GridOk => answer?.status === 'ok')
          .sort((a, b) => b.rows.length - a.rows.length)[0]
          ?? answers.find((answer) => answer?.status === 'none' && answer.reason === 'data rows not found')
          ?? answers.find((answer) => answer?.status === 'none' && answer.reason === 'header not found')
          ?? answers[0];
        // `masked`: 화면 표에 개인정보가 가려진 칸이 있다 — 웹이 운영자에게 알린다.
        if (grid?.status === 'ok') return { rows: grid.rows, continuation: { headers: grid.headers, masked: grid.masked === true } };
        // 못 읽었을 때의 진단(`none` 답). 답이 없거나 모양이 다르면 빈 진단이다.
        const diagnosis: IcecreamGridDiagnosis = (grid as { status?: string } | undefined)?.status === 'none' ? grid as IcecreamGridDiagnosis : {};
        if (icecreamHasNoPendingOrders(diagnosis)) return { rows: [] };
        throw new RuntimeError(SITE_REQUEST_FAILED, icecreamGridFailureMessage(diagnosis), {
          status: null,
          reason: 'page_error',
          url: ICECREAM_MALL_URL,
          diagnosis,
        });
      }, signIn ? { signIn } : {});
    },
  };
}

registerSite({ name: 'icecream-mall', create: (deps, lease) => createIcecreamMallSite(deps.tabs, deps.sleep, createSiteSignIn(ICECREAM_LOGIN, lease.credentials, deps)) });
