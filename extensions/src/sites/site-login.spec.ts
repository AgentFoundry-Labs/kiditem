import { describe, expect, it } from 'vitest';
import { RuntimeError, isRuntimeError } from '../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../core/site-caller';
import { LOGIN_DIALOGS_FILE, LOGIN_FILL_FILE, createSiteLoginGate, ensureLoggedIn, type LoginOutcome, type LoginSpec } from './site-login';
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

type Submitted = { url?: string; formStays?: boolean; dialog?: string };

/**
 * 로그인 화면 하나를 흉내 내는 가짜 탭(경계: `TabPage`). 주소마다 폼이 있는지 정하고, 제출하면 `submit`이 다음 화면을 정한다.
 * 페이지 호출(`KIDITEM_PAGE_CALL`)의 `login.fill`·`login.watchDialogs`·`login.takeDialogs`만 답한다.
 */
function loginTab(options: {
  url: string;
  landAt?: (url: string) => string;
  formAt?: (url: string) => boolean;
  fill?: 'submit' | 'incomplete';
  submit?: (values: Record<string, unknown>) => Submitted;
}) {
  const clock = { now: 0 };
  const state = { url: options.url, form: false, dialogs: [] as string[] };
  const formAt = options.formAt ?? ((url: string) => url.startsWith('https://auth.test'));
  state.form = formAt(state.url);
  const log: string[] = [];
  const filled: Array<Record<string, unknown>> = [];
  const messages: Array<Record<string, unknown>> = [];
  const page: TabPage = {
    tabId: 9,
    async navigate(url) {
      log.push(`navigate ${url}`);
      state.url = options.landAt ? options.landAt(url) : url;
      state.form = formAt(state.url);
      return state.url;
    },
    async waitWhile() {
      return false;
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
        const next = options.submit?.(values) ?? {};
        if (next.url) state.url = next.url;
        state.form = next.formStays ?? false;
        if (next.dialog) state.dialogs.push(next.dialog);
        return reply<T>({ ok: true, value: { state: 'submitted', method: 'exact-text' } });
      }
      return reply<T>({ ok: false, error: 'unexpected' });
    },
    async frames<T>(files: readonly string[]) {
      log.push(`frames ${files.join(',')}`);
      return [{ frameId: 0, result: { loginForm: state.form } as T }];
    },
    listen: () => () => undefined,
    async close() {
      log.push('close');
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
    const tab = loginTab({ url: 'https://auth.test/login', submit: () => ({ formStays: true, dialog: ' 아이디 또는  비밀번호가 일치하지 않습니다. ' }) });
    await expect(ensureLoggedIn(tab.page, SPEC, CREDENTIALS, tab.deps)).resolves.toEqual({
      status: 'form_remains',
      mallMessage: '아이디 또는 비밀번호가 일치하지 않습니다.',
    });
    expect(tab.filled).toHaveLength(1);
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
