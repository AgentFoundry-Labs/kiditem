import { describe, expect, it, vi } from 'vitest';
import { RuntimeError, isRuntimeError } from '../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../core/site-caller';
import { LOGIN_DIALOGS_FILE, LOGIN_FILL_FILE, createSiteLoginGate, ensureLoggedIn, withLoginTab, type LoginOutcome, type LoginSpec } from './site-login';
import type { PageAnswer, TabPage } from './tab-page';

const CREDENTIALS = { loginId: 'fake-id', password: 'fake-password', supplierLoginId: 'fake-supplier' };

const SPEC: LoginSpec = {
  displayName: '테스트몰',
  loginUrl: 'https://mall.test/admin',
  hosts: ['mall.test', 'auth.test'],
  isLoginUrl: (url) => url.hostname === 'auth.test',
  isVerificationUrl: (url) => url.pathname.includes('verify'),
  fields: ['loginId', 'password'],
};

const reply = <T>(value: unknown): T => value as T;

/** `sent: false`: 눌렀지만 몰의 폼 검사(form_check·캡차)가 막아 아무것도 보내지 않았다 — 같은 문서에 폼이 남는다. */
type Submitted = { url?: string; formStays?: boolean; dialog?: string; sent?: boolean };

/**
 * 로그인 화면 하나를 흉내 내는 가짜 탭(경계: `TabPage`). 주소마다 폼이 있는지 정하고, 제출하면 `submit`이 다음 화면을 정한다.
 * 페이지 호출(`KIDITEM_PAGE_CALL`)의 `login.fill`·`login.watchDialogs`·`login.takeDialogs`만 답한다.
 */
function loginTab(options: {
  url: string;
  landAt?: (url: string) => string;
  formAt?: (url: string) => boolean;
  fill?: 'submit' | 'incomplete' | 'verification';
  submit?: (values: Record<string, unknown>) => Submitted;
  /** 이 주소에서는 프레임을 들여다보지 못한다(about:blank처럼 확장 권한 밖 — executeScript가 던진다). */
  unreadableAt?: (url: string) => boolean;
}) {
  const clock = { now: 0 };
  // `filledHere`: 폼을 채운 그 문서에 아직 있다. `submitObserved`: 그 문서에서 보내기가 나갔다(login-fill.js 살피기 값).
  const state = { url: options.url, form: false, dialogs: [] as string[], filledHere: false, submitObserved: false };
  const formAt = options.formAt ?? ((url: string) => url.startsWith('https://auth.test'));
  state.form = formAt(state.url);
  const log: string[] = [];
  const filled: Array<Record<string, unknown>> = [];
  const messages: Array<Record<string, unknown>> = [];
  const page: TabPage = {
    tabId: 9,
    async navigate(url, navigateOptions) {
      log.push(`navigate ${url}`);
      state.url = options.landAt ? options.landAt(url) : url;
      if (navigateOptions?.stopAt?.(state.url)) log.push(`stop at ${state.url}`);
      state.form = formAt(state.url);
      return state.url;
    },
    async waitWhile() {
      return false;
    },
    async focus() {
      log.push('focus');
    },
    async currentUrl() {
      return state.url;
    },
    async ask<T extends PageAnswer>(message: Record<string, unknown>, askOptions: { inject?: { isolated: readonly string[]; main?: readonly string[] }; frameId?: number }) {
      const call = String(message.call);
      messages.push(message);
      log.push(`call ${call}${askOptions.frameId !== undefined ? ` frame ${askOptions.frameId}` : ''}`);
      if (call === 'login.watchDialogs') return reply<T>({ ok: true, value: true });
      if (call === 'login.takeDialogs') {
        const messages = state.dialogs;
        state.dialogs = [];
        return reply<T>({ ok: true, value: messages });
      }
      if (call === 'login.fill') {
        if (!state.form) return reply<T>({ ok: true, value: { state: 'no-login-form' } });
        if (options.fill === 'incomplete') return reply<T>({ ok: true, value: { state: 'incomplete', reason: 'id-input-not-found' } });
        const values = (message.args as { values: Record<string, unknown> }).values;
        filled.push(values);
        if (options.fill === 'verification') return reply<T>({ ok: true, value: { state: 'verification_required', reason: 'captcha' } });
        const next = options.submit?.(values) ?? {};
        if (next.url) state.url = next.url;
        state.form = next.formStays ?? false;
        // 보내기가 나가면 새 문서다(채운 흔적이 없다). 막혔으면 채운 그 문서에 폼이 그대로 남는다.
        const sent = next.sent !== false;
        state.filledHere = !sent;
        state.submitObserved = false;
        if (next.dialog) state.dialogs.push(next.dialog);
        return reply<T>({ ok: true, value: { state: 'submitted', method: 'exact-text' } });
      }
      return reply<T>({ ok: false, error: 'unexpected' });
    },
    async frames<T>(files: readonly string[]) {
      log.push(`frames ${files.join(',')}`);
      if (options.unreadableAt?.(state.url)) throw new Error(`Cannot access contents of url "${state.url}"`);
      return [{ frameId: 0, result: { loginForm: state.form, filledHere: state.filledHere, submitObserved: state.submitObserved } as T }];
    },
    listen: () => () => undefined,
    async close() {
      log.push('close');
    },
    async leave() {
      log.push('leave');
    },
  };
  const deps = {
    now: () => clock.now,
    sleep: async (ms: number) => {
      clock.now += ms;
    },
  };
  return { page, deps, log, filled, state, clock, messages };
}

describe('sites/site-login — ensureLoggedIn(한 화면의 로그인)', () => {
  it('로그인 주소로 가서 스펙의 칸만 채워 누르고, 폼이 사라지면 ok', async () => {
    const tab = loginTab({ url: 'https://mall.test/admin', landAt: () => 'https://auth.test/login', submit: () => ({ url: 'https://mall.test/admin' }) });
    await expect(ensureLoggedIn(tab.page, SPEC, CREDENTIALS, tab.deps)).resolves.toEqual({ status: 'ok' });
    expect(tab.filled).toEqual([{ loginId: 'fake-id', password: 'fake-password' }]);
    // 로그인 화면에 닿으면 다 그려지기를 기다리지 않는다(실기기 R1).
    expect(tab.log).toContain('stop at https://auth.test/login');
    expect(tab.log[0]).toBe('frames content/page-call/login-fill.js');
    expect(tab.log).toContain('navigate https://mall.test/admin');
    expect(tab.log).toContain('call login.watchDialogs frame 0');
    expect(tab.log).toContain('call login.takeDialogs frame 0');
    // 자격을 싣는 폼 채우기만 ISOLATED 전용이다 — 브리지가 MAIN으로 넘기지 않는다(리뷰 S2).
    expect(tab.messages.filter((message) => message.world === 'isolated').map((message) => message.call)).toEqual(['login.fill']);
  });

  it('이미 로그인 화면이면 옮기지 않고 그 화면에서 채운다, 세 칸 스펙은 공급사 아이디도 싣는다', async () => {
    const tab = loginTab({ url: 'https://auth.test/login', submit: () => ({ url: 'https://mall.test/admin' }) });
    const spec: LoginSpec = { ...SPEC, fields: ['supplierLoginId', 'loginId', 'password'] };
    await expect(ensureLoggedIn(tab.page, spec, CREDENTIALS, tab.deps)).resolves.toEqual({ status: 'ok' });
    expect(tab.log.some((line) => line.startsWith('navigate'))).toBe(false);
    expect(tab.filled).toEqual([{ supplierLoginId: 'fake-supplier', loginId: 'fake-id', password: 'fake-password' }]);
  });

  it('눌렀는데 폼이 남으면 form_remains와 몰이 알림 창으로 남긴 말', async () => {
    const tab = loginTab({ url: 'https://auth.test/login', submit: () => ({ formStays: true, dialog: ' 입력하신  정보를 다시 확인해 주세요. ' }) });
    await expect(ensureLoggedIn(tab.page, SPEC, CREDENTIALS, tab.deps)).resolves.toEqual({
      status: 'form_remains',
      mallMessage: '입력하신 정보를 다시 확인해 주세요.',
    });
    // 거절 문장이면 폼이 남았는지 보기 전에 rejected다(실기기 R5).
    const rejected = loginTab({ url: 'https://auth.test/login', submit: () => ({ formStays: true, dialog: ' 아이디 또는  비밀번호가 일치하지 않습니다. ' }) });
    await expect(ensureLoggedIn(rejected.page, SPEC, CREDENTIALS, rejected.deps)).resolves.toEqual({
      status: 'rejected',
      mallMessage: '아이디 또는 비밀번호가 일치하지 않습니다.',
    });
    expect(tab.filled).toHaveLength(1);
  });

  it('빈 탭(about:blank)처럼 화면을 들여다보지 못하면 로그인 입구로 옮긴 뒤 채운다(KID-380 D1 — 15초를 빈 탭에서 돌지 않는다)', async () => {
    const tab = loginTab({
      url: 'about:blank',
      unreadableAt: (url) => url === 'about:blank',
      landAt: () => 'https://auth.test/login',
      submit: () => ({ url: 'https://mall.test/admin' }),
    });
    await expect(ensureLoggedIn(tab.page, SPEC, CREDENTIALS, tab.deps)).resolves.toEqual({ status: 'ok' });
    expect(tab.log).toContain('navigate https://mall.test/admin');
    expect(tab.filled).toHaveLength(1);
  });

  it('누른 뒤 화면을 들여다보지 못하면(답 없음) form_remains가 아니라 unconfirmed — 거절로 단정하지 않는다(리뷰 MUST 3)', async () => {
    const tab = loginTab({
      url: 'https://auth.test/login',
      submit: () => ({ url: 'https://auth.test/stalled', dialog: '처리 중입니다.' }),
      unreadableAt: (url) => url === 'https://auth.test/stalled',
    });
    await expect(ensureLoggedIn(tab.page, SPEC, CREDENTIALS, tab.deps)).resolves.toEqual({ status: 'unconfirmed', mallMessage: '처리 중입니다.' });

    // 살피기가 끝내 답하지 않는 화면(알림 창·무거운 스크립트)도 같다.
    const stalled = loginTab({ url: 'https://auth.test/login', submit: () => ({ formStays: true }) });
    let submitted = false;
    const frames = stalled.page.frames.bind(stalled.page);
    stalled.page.frames = async <T,>(files: readonly string[]) => (submitted ? new Promise<never>(() => undefined) : frames<T>(files));
    const ask = stalled.page.ask.bind(stalled.page);
    stalled.page.ask = async <T extends PageAnswer>(message: Record<string, unknown>, options: Parameters<TabPage['ask']>[1]) => {
      const answer = await ask<T>(message, options);
      if (message.call === 'login.fill') submitted = true;
      return answer;
    };
    vi.useFakeTimers();
    try {
      const outcome = ensureLoggedIn(stalled.page, SPEC, CREDENTIALS, stalled.deps);
      await vi.runAllTimersAsync();
      await expect(outcome).resolves.toEqual({ status: 'unconfirmed' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('누른 뒤 몰이 거절 문장을 알림 창으로 남기면 화면이 다른 곳으로 넘어가도 rejected(실기기 R5 — 아이스크림몰 /error/loginExpired)', async () => {
    const tab = loginTab({
      url: 'https://auth.test/login',
      submit: () => ({ url: 'https://mall.test/error/loginExpired', dialog: '아이디 혹은 비밀번호가 일치하지 않습니다.' }),
    });
    await expect(ensureLoggedIn(tab.page, SPEC, CREDENTIALS, tab.deps)).resolves.toEqual({
      status: 'rejected',
      mallMessage: '아이디 혹은 비밀번호가 일치하지 않습니다.',
    });
  });

  it('캡차가 붙은 폼이면 채우기가 verification_required로 답하고 누르지 않는다 — 운영자가 풀 일이다(재QA 3 D1)', async () => {
    const tab = loginTab({ url: 'https://auth.test/login', fill: 'verification' });
    await expect(ensureLoggedIn(tab.page, SPEC, CREDENTIALS, tab.deps)).resolves.toEqual({ status: 'verification_required' });
  });

  it('눌렀는데 몰의 폼 검사가 막아 아무것도 보내지 않았으면(같은 문서에 폼) form_remains가 아니라 unconfirmed(재QA 3 D1)', async () => {
    const blocked = loginTab({ url: 'https://auth.test/login', submit: () => ({ formStays: true, sent: false }) });
    await expect(ensureLoggedIn(blocked.page, SPEC, CREDENTIALS, blocked.deps)).resolves.toEqual({ status: 'unconfirmed' });

    // 실제로 보내고 폼이 다시 온 것(새 문서)은 그대로 form_remains다.
    const sent = loginTab({ url: 'https://auth.test/login', submit: () => ({ formStays: true }) });
    await expect(ensureLoggedIn(sent.page, SPEC, CREDENTIALS, sent.deps)).resolves.toEqual({ status: 'form_remains' });
  });

  it('로그인 폼이 어디에도 없으면 no_form — 채우지 않는다', async () => {
    const tab = loginTab({ url: 'https://mall.test/admin', formAt: () => false });
    await expect(ensureLoggedIn(tab.page, SPEC, CREDENTIALS, tab.deps)).resolves.toEqual({ status: 'no_form' });
    expect(tab.filled).toEqual([]);
  });

  it('settleMs가 있으면 폼 없는 화면이 그만큼 이어져야 no_form이다(늦게 뜨는 로그인 폼은 채운다)', async () => {
    const tab = loginTab({ url: 'https://mall.test/admin', formAt: () => false, submit: () => ({ url: 'https://mall.test/admin' }) });
    const spec: LoginSpec = { ...SPEC, settleMs: 5_000 };
    const late = ensureLoggedIn(tab.page, spec, CREDENTIALS, {
      now: tab.deps.now,
      sleep: async (ms) => {
        tab.clock.now += ms;
        // 2초 뒤 클라이언트 리다이렉트로 로그인 폼이 뜬다(키드키즈 출고관리 → 로그인).
        if (tab.clock.now >= 2_000 && tab.filled.length === 0) {
          tab.state.url = 'https://auth.test/login';
          tab.state.form = true;
        }
      },
    });
    await expect(late).resolves.toEqual({ status: 'ok' });
    expect(tab.filled).toHaveLength(1);

    const settled = loginTab({ url: 'https://mall.test/admin', formAt: () => false });
    await expect(ensureLoggedIn(settled.page, spec, CREDENTIALS, settled.deps)).resolves.toEqual({ status: 'no_form' });
    expect(settled.clock.now).toBeGreaterThanOrEqual(5_000);
  });

  it('본인확인 화면이면 verification_required — 채우지 않는다', async () => {
    const tab = loginTab({ url: 'https://mall.test/security/verify_user.htm', formAt: () => false });
    await expect(ensureLoggedIn(tab.page, SPEC, CREDENTIALS, tab.deps)).resolves.toEqual({ status: 'verification_required' });
    const after = loginTab({ url: 'https://auth.test/login', submit: () => ({ url: 'https://mall.test/verify' }) });
    await expect(ensureLoggedIn(after.page, SPEC, CREDENTIALS, after.deps)).resolves.toEqual({ status: 'verification_required' });
  });

  it('폼을 끝내 다 채우지 못하면 15초 뒤 unconfirmed', async () => {
    const tab = loginTab({ url: 'https://auth.test/login', fill: 'incomplete' });
    await expect(ensureLoggedIn(tab.page, SPEC, CREDENTIALS, tab.deps)).resolves.toEqual({ status: 'unconfirmed' });
    expect(tab.clock.now).toBeGreaterThanOrEqual(15_000);
  });

  it('주입 파일은 폼 채우기(ISOLATED)와 알림 창(MAIN) 둘이다', () => {
    expect(LOGIN_FILL_FILE).toBe('content/page-call/login-fill.js');
    expect(LOGIN_DIALOGS_FILE).toBe('content/page-call/login-dialogs.js');
  });
});

function loginRequired(url = 'https://auth.test/login') {
  return new RuntimeError(SITE_LOGIN_REQUIRED, '테스트몰 로그인이 필요합니다.', { url });
}

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!isRuntimeError(error)) throw new Error(`expected RuntimeError, got ${String(error)}`);
  return error;
}

describe('sites/site-login — createSiteLoginGate(로그인 화면이면 한 번 로그인하고 한 번 다시)', () => {
  it('자격이 없으면 로그인하지 않고 SITE_LOGIN_REQUIRED{reason: no_credentials}', async () => {
    const withLogin = createSiteLoginGate(null);
    let logins = 0;
    const error = await failure(withLogin(async () => { throw loginRequired(); }, async () => { logins += 1; return { status: 'ok' }; }));
    expect(error).toMatchObject({ code: SITE_LOGIN_REQUIRED, details: { url: 'https://auth.test/login', reason: 'no_credentials' } });
    expect(logins).toBe(0);
  });

  it('자격이 있으면 로그인하고 같은 호출을 한 번 다시 한다', async () => {
    const withLogin = createSiteLoginGate(CREDENTIALS);
    let calls = 0;
    await expect(withLogin(async () => {
      calls += 1;
      if (calls === 1) throw loginRequired();
      return 'rows';
    }, async () => ({ status: 'ok' }))).resolves.toBe('rows');
    expect(calls).toBe(2);
  });

  it('다시 해도 로그인 화면이면 로그인 결과로 까닭을 싣는다 — 폼이 남았으면 credentials_rejected와 몰의 말', async () => {
    const rejected = createSiteLoginGate(CREDENTIALS);
    const error = await failure(rejected(async () => { throw loginRequired(); }, async () => ({ status: 'form_remains', mallMessage: '비밀번호가 일치하지 않습니다.' })));
    expect(error).toMatchObject({ code: SITE_LOGIN_REQUIRED, details: { reason: 'credentials_rejected', mallMessage: '비밀번호가 일치하지 않습니다.' } });
    expect(JSON.stringify(error.details)).not.toContain('fake-password');

    for (const status of ['ok', 'no_form', 'unconfirmed'] as const) {
      const gate = createSiteLoginGate(CREDENTIALS);
      expect(await failure(gate(async () => { throw loginRequired(); }, async () => ({ status })))).toMatchObject({ details: { reason: 'login_unconfirmed' } });
    }
  });

  it('rejected도 credentials_rejected — 몰의 말은 details.mallMessage에만 싣고 오류 문장은 레지스트리 말 그대로다(실기기 R5)', async () => {
    const gate = createSiteLoginGate(CREDENTIALS);
    const error = await failure(gate(async () => { throw loginRequired(); }, async () => ({ status: 'rejected', mallMessage: '아이디 혹은 비밀번호가 일치하지 않습니다.' })));
    expect(error).toMatchObject({ code: SITE_LOGIN_REQUIRED, details: { reason: 'credentials_rejected', mallMessage: '아이디 혹은 비밀번호가 일치하지 않습니다.' } });
    expect(error.message).toBe('테스트몰 로그인이 필요합니다. 저장된 아이디·비밀번호로 로그인하지 못했습니다.');
  });

  it('본인확인이면 다시 하지 않고 verification_required', async () => {
    const withLogin = createSiteLoginGate(CREDENTIALS);
    let calls = 0;
    const error = await failure(withLogin(async () => { calls += 1; throw loginRequired(); }, async () => ({ status: 'verification_required' })));
    expect(error.details).toMatchObject({ reason: 'verification_required' });
    expect(calls).toBe(1);
  });

  it('로그인이 아닌 실패는 그대로 넘기고, 동시에 막힌 호출들은 로그인 한 번을 함께 기다린다', async () => {
    const withLogin = createSiteLoginGate(CREDENTIALS);
    const other = new RuntimeError(SITE_REQUEST_FAILED, '실패', { status: 500 });
    expect(await failure(withLogin(async () => { throw other; }, async () => ({ status: 'ok' })))).toBe(other);

    let logins = 0;
    let signedIn = false;
    const login = async (): Promise<LoginOutcome> => {
      logins += 1;
      await Promise.resolve();
      signedIn = true;
      return { status: 'ok' };
    };
    const read = (value: number) => withLogin(async () => {
      if (!signedIn) throw loginRequired();
      return value;
    }, login);
    await expect(Promise.all([read(1), read(2), read(3)])).resolves.toEqual([1, 2, 3]);
    expect(logins).toBe(1);
  });
});

describe('sites/site-login — withLoginTab(로그인하러 연 탭)', () => {
  it('문턱이 멈춰도 로그인 화면으로 가지 못한 빈 탭(about:blank)은 운영자에게 남기지 않고 닫는다(KID-380 D1)', async () => {
    const blank = loginTab({ url: 'about:blank', unreadableAt: () => true });
    const withLogin = createSiteLoginGate(CREDENTIALS);
    const error = await failure(withLoginTab(withLogin, async () => { throw loginRequired(); }, async () => blank.page, async () => ({ status: 'unconfirmed' })));
    expect(error.details).toMatchObject({ reason: 'login_unconfirmed' });
    expect(blank.log).toContain('close');

    const atLogin = loginTab({ url: 'https://auth.test/login' });
    await failure(withLoginTab(createSiteLoginGate(CREDENTIALS), async () => { throw loginRequired(); }, async () => atLogin.page, async () => ({ status: 'form_remains' })));
    expect(atLogin.log).not.toContain('close');
  });
});
