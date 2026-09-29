import type { TabPage, TabPages } from '../tab-page';
import { checkSpecOf, MALL_LOGIN_REASONS as R, type MallCheckSpec, type MallLoginReason, type Seen } from './check-specs';

/**
 * 몰 로그인 확인(KID-366 `checkMallLogin`, 옛 `mall-session.js` `checkLogin`·`mall-session-probe.js` 이식). 로그인은 하지 않는다 —
 * 아이디·비밀번호를 넣지도 누르지도 않고, 주소·본문·머리를 돌려주지 않는다. 몰의 확인 주소를 사용자 쿠키로 조용히 한 번 읽어
 * 확실하면 그 답을 쓰고, 아니면 관리자 화면을 확인용 백그라운드 탭에 열어(알림 창 가드) 로그인 폼·인증 화면이 뜨는지 보고 닫는다.
 * 웹이 보는 답은 셋 중 하나다 — 가리지 못한 몰은 사람이 들어가 봐야 하므로 `signed_out`에 이유를 싣는다.
 */
export const LOGIN_SCREEN_FILE = 'content/page-call/login-screen.js';

export type MallLoginState = 'signed_in' | 'verification_required' | 'signed_out';

export interface MallLoginCheckDeps {
  fetch(url: string, init: RequestInit): Promise<Response>;
  tabs: TabPages;
  /** 확장 권한(`host_permissions`) 안의 origin인가 — 저장된 사이트 주소는 그 안에서만 연다. */
  hasPermission(origin: string): Promise<boolean>;
  sleep(ms: number): Promise<void>;
}

const PROBE_TIMEOUT_MS = 8_000;
const SCREEN_LOAD_TIMEOUT_MS = 20_000;
const SCREEN_SETTLE_MS = 2_500;
const SCREEN_SECOND_LOOK_MS = 2_000;
// 탭의 전체 주소로 보는 로그인·인증 화면(호스트로도 가린다). 권한 밖 통합 로그인으로 넘어가 들여다보지 못해도 주소는 읽힌다.
const LOGIN_SCREEN_URL = /\/(?:login|signin|sign-in|signIn)(?:[/?#.]|$)|loginform|partnerlogin|partner_login|login_so|authentication\/login|xauth\.coupang\.com|nid\.naver\.com|accounts\.kakao\.com|accounts\.commerce\.naver\.com/i;
const VERIFY_SCREEN_URL = /verify_user|\/otp(?:[/?#.]|$)|two-?factor|\/mfa(?:[/?#.]|$)/i;

export async function checkMallLogin(deps: MallLoginCheckDeps, mallKey: string, siteUrl?: string): Promise<{ state: MallLoginState; reason: MallLoginReason }> {
  const spec = checkSpecOf(mallKey);
  const passive = spec?.loggedInSignal ? await probe(deps, spec) : { verdict: 'unknown' as const, reason: R.NO_PASSIVE_CHECK };
  const found = passive.verdict !== 'unknown' ? passive : await lookAtScreen(deps, spec?.entryUrl ?? savedSiteUrl(siteUrl));
  const state: MallLoginState = found.verdict === 'in'
    ? 'signed_in'
    : found.verdict === 'out' && found.reason === R.VERIFICATION_REQUIRED ? 'verification_required' : 'signed_out';
  return { state, reason: found.reason };
}

/** 운영자가 적어 둔 사이트 주소(http·https만). 확장이 임의의 주소를 열지 않는다. */
function savedSiteUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

async function probe(deps: MallLoginCheckDeps, spec: MallCheckSpec): Promise<Seen> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const request = (redirect: RequestRedirect) => deps.fetch(spec.entryUrl, {
    method: 'GET',
    credentials: 'include',
    redirect,
    cache: 'no-store',
    headers: { ...(spec.headers ?? {}) },
    signal: controller.signal,
  });
  try {
    let response: Response;
    try {
      response = await request('follow');
    } catch (error) {
      if (controller.signal.aborted) throw error;
      // 로그인 화면이 권한 밖 주소로 넘기면 따라가지 못해 읽기가 실패한다. 관리자 주소에서 튕겨 나갔는지만 다시 본다.
      const manual = await request('manual');
      const bounced = manual.type === 'opaqueredirect' || (manual.status >= 300 && manual.status < 400);
      return bounced ? { verdict: 'out', reason: R.REDIRECTED_AWAY } : { verdict: 'unknown', reason: R.NETWORK_ERROR };
    }
    if (response.status === 401 || response.status === 403) return { verdict: 'out', reason: R.HTTP_UNAUTHORIZED };
    return spec.loggedInSignal!({ finalPath: pathOf(response.url || spec.entryUrl), texts: decodeAll(await response.arrayBuffer()) });
  } catch {
    return { verdict: 'unknown', reason: controller.signal.aborted ? R.TIMEOUT : R.NETWORK_ERROR };
  } finally {
    clearTimeout(timer);
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

function decodeAll(buffer: ArrayBuffer): string[] {
  const texts = [new TextDecoder('utf-8').decode(buffer)];
  // euc-kr 몰(키드키즈 등)은 utf-8로 읽으면 한글이 깨진다 — 깨졌으면 euc-kr로도 읽어 둘 다 본다.
  if (texts[0]!.includes('\uFFFD')) {
    try {
      texts.push(new TextDecoder('euc-kr').decode(buffer));
    } catch {
      // euc-kr 디코더가 없으면 utf-8 결과만으로 가린다.
    }
  }
  return texts;
}

async function lookAtScreen(deps: MallLoginCheckDeps, url: string | null): Promise<Seen> {
  if (!url) return { verdict: 'unknown', reason: R.NO_LOGIN_ADDRESS };
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return { verdict: 'unknown', reason: R.NO_LOGIN_ADDRESS };
  }
  if (!(await deps.hasPermission(target.origin))) return { verdict: 'unknown', reason: R.LOGIN_PAGE_NOT_REACHABLE };
  // 로드 중 알림 창이 백그라운드 탭을 멈추지 않게 옮기기 전에 가드를 건다(KID-380 D4).
  const release = await deps.tabs.guardDialogs([target.hostname]);
  let page: TabPage | null = null;
  try {
    page = await deps.tabs.open('about:blank');
    await page.navigate(target.href, { timeoutMs: SCREEN_LOAD_TIMEOUT_MS, continueOnTimeout: true }).catch(() => undefined);
    // SPA는 화면을 띄운 뒤 로그인 여부를 보고 로그인 화면으로 넘긴다 — 그 시간을 준다.
    await deps.sleep(SCREEN_SETTLE_MS);
    let found: Seen & { definite: boolean } = { verdict: 'unknown', reason: R.LOGIN_PAGE_NOT_REACHABLE, definite: false };
    for (let look = 0; look < 2; look += 1) {
      if (look > 0) await deps.sleep(SCREEN_SECOND_LOOK_MS);
      found = await lookOnce(page);
      if (found.definite) break;
    }
    return { verdict: found.verdict, reason: found.reason };
  } catch {
    return { verdict: 'unknown', reason: R.LOGIN_PAGE_NOT_REACHABLE };
  } finally {
    await page?.close();
    await release();
  }
}

async function lookOnce(page: TabPage): Promise<Seen & { definite: boolean }> {
  const address = await page.currentUrl().catch(() => '');
  const frames = await page.frames<{ loginForm?: boolean; verification?: boolean }>([LOGIN_SCREEN_FILE]).catch(() => null);
  if (frames?.some((frame) => frame.result.loginForm === true) || LOGIN_SCREEN_URL.test(address)) {
    return { verdict: 'out', reason: R.LOGIN_PAGE, definite: true };
  }
  if (frames?.some((frame) => frame.result.verification === true) || VERIFY_SCREEN_URL.test(address)) {
    return { verdict: 'out', reason: R.VERIFICATION_REQUIRED, definite: true };
  }
  // 알림 창으로 멈췄거나 권한 밖 주소로 넘어갔다 — 로그인 필요라고 단정하지 않는다.
  if (!frames || frames.length === 0) return { verdict: 'unknown', reason: R.LOGIN_PAGE_NOT_REACHABLE, definite: false };
  return { verdict: 'in', reason: R.ADMIN_PAGE, definite: false };
}
