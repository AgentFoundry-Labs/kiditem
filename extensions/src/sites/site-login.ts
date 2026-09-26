import { RuntimeError, isRuntimeError } from '../core/errors';
import { SITE_LOGIN_REQUIRED } from '../core/site-caller';
import { callPage } from './page-call';
import type { SiteCredentials } from './registry';
import { hostWithin, leftForOperator, type PageGuard, type TabPage, type TabPages } from './tab-page';

/**
 * 사이트 자동 로그인(KID-377). 옛 `mall-session.js` `ensureLoggedIn`·`fillLoginForm`의 규칙을 새 런타임으로 옮겼다:
 * 로그인 화면에서 저장 자격으로 폼을 채워 누르고(15초 안), 폼이 사라졌는지까지 보고 답한다. 폼이 남은 것만으로
 * 비밀번호가 틀렸다고 단정하지 않는다 — 몰이 알림 창으로 남긴 말(`mallMessage`)을 함께 돌려주고, 막을지는 웹이 정한다.
 *
 * 폼 채우기는 파일 주입(`content/page-call/login-fill.js`, ISOLATED)이고 자격은 페이지 호출 인자로 그 탭에만 간다
 * (옛 `executeScript` 인자와 같은 노출, README). 알림 창 받기는 MAIN world 파일(`login-dialogs.js`)이다.
 */
export const LOGIN_FILL_FILE = 'content/page-call/login-fill.js';
export const LOGIN_DIALOGS_FILE = 'content/page-call/login-dialogs.js';

/** 폼 자동 입력을 시도하는 시간(옛 `FILL_WINDOW_MS`). */
export const LOGIN_FILL_WINDOW_MS = 15_000;
const FILL_RETRY_MS = 500;
const AFTER_SUBMIT_MS = 1_500;
const AFTER_REDIRECT_MS = 1_200;
const NAVIGATION_TIMEOUT_MS = 30_000;
const CALL_TIMEOUT_MS = 5_000;
const REMAIN_CHECKS = 3;
const REMAIN_CHECK_GAP_MS = 1_500;

export type LoginField = 'loginId' | 'password' | 'supplierLoginId';

/** 사이트 하나의 로그인 입구(옛 `mall-session.js` SPECS 한 줄에서 로그인에 쓰는 칸). */
export interface LoginSpec {
  /** 운영자에게 보이는 사이트 이름. */
  displayName: string;
  /** 저장 자격으로 로그인하러 들어가는 주소(로그아웃이면 로그인 화면으로 넘어간다). */
  loginUrl: string;
  /** 로그인 화면과 로그인 뒤 화면이 있는 호스트(확장 권한 안). 이 밖으로 가면 채우지 않는다. */
  hosts: readonly string[];
  /** 로그인 화면 주소인가(그 주소면 옮기지 않고 그 화면에서 채운다). */
  isLoginUrl(url: URL): boolean;
  /** 로그인 뒤에 따로 오는 본인확인 화면(키드키즈 verify_user). 운영자가 풀어야 한다. */
  isVerificationUrl?(url: URL): boolean;
  /** 그 로그인 폼이 받는 자격 칸. 아트공구(Cafe24)는 공급사 아이디까지 셋이다. */
  fields: readonly LoginField[];
  /**
   * 폼 없는 화면이 이만큼 이어져야 '폼 없음'이다. 로그인 폼을 클라이언트 리다이렉트로 늦게 여는 몰(키드키즈 출고관리 5초,
   * 아이스크림몰 main.do). 없으면 처음 본 폼 없는 화면에서 끝낸다.
   */
  settleMs?: number;
}

/**
 * `ok`: 눌렀고 폼이 사라졌다. `no_form`: 로그인 폼이 없었다(이미 로그인됐거나 폼이 아닌 화면). `form_remains`: 눌렀는데
 * 폼이 남았다(`mallMessage`가 있으면 몰의 말). `verification_required`: 본인확인 화면. `unconfirmed`: 폼을 다 채우지
 * 못했거나 화면을 들여다보지 못했다.
 */
export type LoginStatus = 'ok' | 'no_form' | 'form_remains' | 'verification_required' | 'unconfirmed';
export interface LoginOutcome {
  status: LoginStatus;
  mallMessage?: string;
}

export interface LoginDeps {
  now(): number;
  sleep(ms: number): Promise<void>;
}

type FillAnswer = { state?: string; reason?: string; method?: string };
type FrameProbe = { loginForm?: boolean };
const NO_ANSWER = Symbol('no-answer');

/** 이 탭에서 로그인한다. 던지지 않는다 — 탭이 닫힌 것처럼 부를 수 없는 일만 그대로 넘긴다. */
export async function ensureLoggedIn(
  page: TabPage,
  spec: LoginSpec,
  credentials: SiteCredentials,
  deps: LoginDeps,
  options: { timeoutMs?: number } = {},
): Promise<LoginOutcome> {
  const guard = loginGuard(spec);
  const values = Object.fromEntries(spec.fields.map((field) => [field, credentials[field] ?? null]));
  if (isVerification(spec, await safeUrl(page))) return { status: 'verification_required' };
  // 로그인 폼이 이미 보이거나 로그인 주소면 그 화면에서 채운다. 아니면 로그인 입구로 간다.
  const first = await loginFrame(page);
  if (first === null && !isLogin(spec, await safeUrl(page))) {
    await page.navigate(spec.loginUrl, { timeoutMs: NAVIGATION_TIMEOUT_MS, continueOnTimeout: true });
  }

  const deadline = deps.now() + (options.timeoutMs ?? LOGIN_FILL_WINDOW_MS);
  const watching = new Set<number>();
  let noFormSince: number | null = null;
  while (deps.now() < deadline) {
    const url = await safeUrl(page);
    if (isVerification(spec, url)) return { status: 'verification_required' };
    const frameId = await loginFrame(page);
    if (frameId === null) {
      // 로그인 주소에 머무는 동안은 폼이 아직 그려지는 중이다.
      if (isLogin(spec, url)) noFormSince = null;
      else {
        noFormSince ??= deps.now();
        if (deps.now() - noFormSince >= (spec.settleMs ?? 0)) return { status: 'no_form' };
      }
    } else if (frameId !== undefined) {
      noFormSince = null;
      if (!watching.has(frameId)) {
        watching.add(frameId);
        await pageCall(page, 'login.watchDialogs', {}, guard, spec, frameId, 'main');
      }
      const filled = await pageCall<FillAnswer>(page, 'login.fill', { values }, guard, spec, frameId, 'isolated');
      if (filled?.state === 'submitted') return afterSubmit(page, spec, guard, frameId, deps);
    }
    await deps.sleep(FILL_RETRY_MS);
  }
  return { status: 'unconfirmed' };
}

async function afterSubmit(page: TabPage, spec: LoginSpec, guard: PageGuard, frameId: number, deps: LoginDeps): Promise<LoginOutcome> {
  await deps.sleep(AFTER_SUBMIT_MS);
  await deps.sleep(AFTER_REDIRECT_MS);
  // 몰이 알림 창으로 남긴 답. 왜 안 됐는지는 몰이 가장 잘 안다.
  const dialogs = await pageCall<unknown[]>(page, 'login.takeDialogs', {}, guard, spec, frameId, 'main');
  const mallMessage = (Array.isArray(dialogs) ? dialogs : [])
    .map((message) => String(message).replace(/\s+/g, ' ').trim())
    .find(Boolean);
  const withMessage = mallMessage ? { mallMessage: mallMessage.slice(0, 300) } : {};
  if (isVerification(spec, await safeUrl(page))) return { status: 'verification_required', ...withMessage };
  return (await formRemains(page, deps)) ? { status: 'form_remains', ...withMessage } : { status: 'ok', ...withMessage };
}

/**
 * 누른 뒤 로그인 폼이 남았는가(옛 `loginFormRemainsAfterSubmit`). 답이 없으면(알림 창·무거운 스크립트로 멈춘 화면) 남은
 * 것으로 본다. 화면이 넘어가는 중이라 못 보면 잠시 뒤 다시 보고, 마지막으로 본 화면에 폼이 있을 때만 남았다고 한다.
 */
async function formRemains(page: TabPage, deps: LoginDeps): Promise<boolean> {
  let lastSeen = false;
  for (let check = 0; check < REMAIN_CHECKS; check += 1) {
    if (check > 0) await deps.sleep(REMAIN_CHECK_GAP_MS);
    const probed = await probe(page);
    if (probed === NO_ANSWER) return true;
    if (probed === null || probed.length === 0) continue;
    lastSeen = probed.some((frame) => frame.result?.loginForm === true);
    if (!lastSeen) return false;
  }
  return lastSeen;
}

/** 로그인 폼이 보이는 프레임(맨 위 문서 먼저). 폼이 없으면 null, 화면을 들여다보지 못했으면 undefined. */
async function loginFrame(page: TabPage): Promise<number | null | undefined> {
  const probed = await probe(page);
  if (probed === NO_ANSWER || probed === null || probed.length === 0) return undefined;
  const found = probed.filter((frame) => frame.result?.loginForm === true).sort((a, b) => a.frameId - b.frameId)[0];
  return found ? found.frameId : null;
}

async function probe(page: TabPage): Promise<Array<{ frameId: number; result: FrameProbe }> | null | typeof NO_ANSWER> {
  try {
    return await within(page.frames<FrameProbe>([LOGIN_FILL_FILE]), CALL_TIMEOUT_MS);
  } catch {
    // 권한 밖 주소로 넘어갔거나 화면이 바뀌는 중이다.
    return null;
  }
}

async function pageCall<T>(page: TabPage, call: string, args: unknown, guard: PageGuard, spec: LoginSpec, frameId: number, world: 'isolated' | 'main'): Promise<T | null> {
  try {
    return await callPage<T>(page, call, args, {
      timeoutMs: CALL_TIMEOUT_MS,
      guard,
      displayName: spec.displayName,
      frameId,
      // 폼 채우기는 자격을 싣는다 — ISOLATED 처리기에서만 돌고 MAIN(페이지)으로 넘기지 않는다(리뷰 S2).
      ...(world === 'main' ? { main: [LOGIN_DIALOGS_FILE] } : { isolated: [LOGIN_FILL_FILE], isolatedOnly: true }),
    });
  } catch {
    // 화면이 넘어가거나 멈췄다 — 다음 바퀴에 다시 본다.
    return null;
  }
}

/** 로그인 단계의 주소 규칙: 로그인 화면도 채울 곳이다(수집 guard는 로그인 화면에서 멈추게 한다). */
function loginGuard(spec: LoginSpec): PageGuard {
  return {
    allows: (url) => hostWithin(url, spec.hosts),
    isLogin: () => false,
    loginMessage: `${spec.displayName} 로그인이 필요합니다.`,
  };
}

async function safeUrl(page: TabPage): Promise<string> {
  return page.currentUrl().catch(() => '');
}

function parsed(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLogin(spec: LoginSpec, value: string): boolean {
  const url = parsed(value);
  return url !== null && spec.isLoginUrl(url);
}

function isVerification(spec: LoginSpec, value: string): boolean {
  const url = parsed(value);
  return url !== null && spec.isVerificationUrl?.(url) === true;
}

function within<T>(work: Promise<T>, ms: number): Promise<T | typeof NO_ANSWER> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof NO_ANSWER>((resolve) => {
    timer = setTimeout(() => resolve(NO_ANSWER), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * 로그인 화면에서 멈춘 실행의 까닭(`SITE_LOGIN_REQUIRED` details.reason). 웹이 이것으로 자동 로그인을 막을지 정한다:
 * `credentials_rejected`(눌렀는데 폼이 남았다 — `mallMessage`가 거절 문장이면 막는다), `no_credentials`(자격을 받지
 * 못했다), `verification_required`(본인확인), `login_unconfirmed`(로그인했는지 확인하지 못했다).
 */
export type LoginFailureReason = 'credentials_rejected' | 'no_credentials' | 'verification_required' | 'login_unconfirmed';

/**
 * 사이트 핸들 하나(실행 하나)의 로그인 문턱. `call`이 `SITE_LOGIN_REQUIRED`로 멈추면 자격이 있을 때 `login`을 한 번만
 * 돌리고(동시에 막힌 호출은 그 한 번을 함께 기다린다 — 같은 몰을 거듭 두드리면 계정이 잠긴다) `call`을 한 번 다시 한다.
 * 그래도 로그인 화면이면 까닭을 실은 `SITE_LOGIN_REQUIRED`를 던진다 — 탭은 운영자에게 남는다(`leftForOperator`).
 * 자격은 오류에 싣지 않는다.
 */
export function createSiteLoginGate(credentials: SiteCredentials | null | undefined) {
  let attempt: Promise<LoginOutcome> | null = null;
  const usable = Boolean(credentials?.loginId && credentials.password);
  return async function withLogin<T>(call: () => Promise<T>, login: () => Promise<LoginOutcome>): Promise<T> {
    let blocked: RuntimeError;
    try {
      return await call();
    } catch (error) {
      if (!isLoginRequired(error)) throw error;
      blocked = error;
    }
    if (!usable) throw loginFailure(blocked, 'no_credentials');
    attempt ??= login().catch((): LoginOutcome => ({ status: 'unconfirmed' }));
    const outcome = await attempt;
    if (outcome.status === 'verification_required') throw loginFailure(blocked, 'verification_required');
    try {
      return await call();
    } catch (error) {
      if (!isLoginRequired(error)) throw error;
      throw outcome.status === 'form_remains'
        ? loginFailure(error, 'credentials_rejected', outcome.mallMessage)
        : loginFailure(error, 'login_unconfirmed');
    }
  };
}

export type SiteLoginGate = ReturnType<typeof createSiteLoginGate>;

/**
 * 탭을 스스로 여는 사이트(몰 주문 몰, KID-359 H3)의 로그인 문턱. 한 실행(사이트 핸들)에 하나 — 로그인은 한 번만 한다.
 * - `onPage`: 읽기가 로그인 화면에서 멈추면 그 탭에서 로그인하고 `returnTo`로 돌아가 같은 읽기를 한 번 다시 한다.
 * - `beforeTab`: 탭 없이 서비스워커로 먼저 묻는 호출(도매꾹 엑셀 목록)이 멈추면 새 탭에서 로그인하고(로그인되면 닫는다)
 *   같은 호출을 다시 한다.
 */
export interface SiteSignIn {
  onPage<T>(page: TabPage, returnTo: string, read: () => Promise<T>): Promise<T>;
  beforeTab<T>(tabs: TabPages, call: () => Promise<T>): Promise<T>;
}

export function createSiteSignIn(spec: LoginSpec, credentials: SiteCredentials | null | undefined, deps: LoginDeps): SiteSignIn {
  const withLogin = createSiteLoginGate(credentials);
  // 자격이 없으면 문턱이 로그인을 부르지 않는다(`no_credentials`).
  const login = (page: TabPage) => ensureLoggedIn(page, spec, credentials as SiteCredentials, deps);
  return {
    onPage: (page, returnTo, read) => withLogin(read, async () => {
      const outcome = await login(page);
      if (outcome.status !== 'verification_required') await page.navigate(returnTo, { timeoutMs: NAVIGATION_TIMEOUT_MS });
      return outcome;
    }),
    beforeTab: (tabs, call) => withLoginTab(withLogin, call, () => tabs.open('about:blank'), login),
  };
}

/**
 * 로그인하러 새 탭을 여는 문턱(리뷰 S4). 호출이 (다시 해서) 되면 연 탭을 닫고, 문턱이 로그인 화면에서 멈추면
 * (`leftForOperator`) 운영자가 그 탭에서 로그인하도록 남긴다. 그 밖의 실패도 탭을 닫는다.
 */
export async function withLoginTab<T>(
  withLogin: SiteLoginGate,
  call: () => Promise<T>,
  open: () => Promise<TabPage>,
  login: (page: TabPage) => Promise<LoginOutcome>,
): Promise<T> {
  let opened: TabPage | null = null;
  try {
    const result = await withLogin(call, async () => {
      opened = await open();
      return login(opened);
    });
    return result;
  } catch (error) {
    if (leftForOperator(error)) opened = null;
    throw error;
  } finally {
    await (opened as TabPage | null)?.close();
  }
}

function isLoginRequired(error: unknown): error is RuntimeError {
  return isRuntimeError(error) && error.code === SITE_LOGIN_REQUIRED;
}

const REASON_TEXT: Record<LoginFailureReason, string> = {
  no_credentials: '',
  credentials_rejected: ' 저장된 아이디·비밀번호로 로그인하지 못했습니다',
  verification_required: ' 본인 인증이 필요합니다. 열린 탭에서 인증한 뒤 다시 수집해 주세요.',
  login_unconfirmed: ' 저장된 계정으로 로그인했는지 확인하지 못했습니다. 열린 탭을 확인해 주세요.',
};

function loginFailure(error: RuntimeError, reason: LoginFailureReason, mallMessage?: string): RuntimeError {
  const text = reason === 'credentials_rejected' ? `${REASON_TEXT[reason]}${mallMessage ? `: ${mallMessage}` : ''}.` : REASON_TEXT[reason];
  return new RuntimeError(SITE_LOGIN_REQUIRED, `${error.message}${text}`, {
    ...(error.details ?? {}),
    reason,
    ...(mallMessage ? { mallMessage } : {}),
  }, error);
}
