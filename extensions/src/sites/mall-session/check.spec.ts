import { describe, expect, it } from 'vitest';
import { fastClock } from '../login.fake';
import { fakeTabPages } from '../tab-page.fake';
import { checkMallLogin, LOGIN_SCREEN_FILE } from './check';

function body(url: string, text: string, status = 200) {
  const response = new Response(new TextEncoder().encode(text), { status });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

function harness(options: {
  fetch?: (url: string, init: RequestInit) => Response | Promise<Response>;
  frames?: Array<{ frameId: number; result: unknown }> | null;
  landAt?: string;
  permitted?: boolean;
} = {}) {
  const fetched: Array<{ url: string; init: RequestInit }> = [];
  const fake = fakeTabPages({
    answer: () => ({}),
    ...(options.landAt ? { landAt: () => options.landAt! } : {}),
    frames: () => {
      if (options.frames === null) throw new Error('Cannot access contents of the page');
      return options.frames ?? [{ frameId: 0, result: { loginForm: false, verification: false } }];
    },
    logBookkeeping: true,
  });
  const deps = {
    fetch: async (url: string, init: RequestInit = {}) => {
      fetched.push({ url, init });
      if (!options.fetch) throw new Error('unexpected fetch');
      return options.fetch(url, init);
    },
    tabs: fake.tabs,
    hasPermission: async () => options.permitted !== false,
    ...fastClock(),
  };
  return { deps, fake, fetched };
}

describe('몰 로그인 확인(KID-366 checkMallLogin) — 로그인은 하지 않는다', () => {
  it('조용히 한 번 읽어(쿠키, GET) 확실하면 화면을 열지 않는다', async () => {
    const { deps, fake, fetched } = harness({ fetch: (url) => body(url, '{"dat":[]}') });
    await expect(checkMallLogin(deps, 'domeggook')).resolves.toEqual({ state: 'signed_in', reason: 'admin_api' });
    expect(fetched).toHaveLength(1);
    expect(fetched[0]!.init).toMatchObject({ method: 'GET', credentials: 'include', headers: { 'x-requested-with': 'XMLHttpRequest' } });
    expect('body' in fetched[0]!.init).toBe(false);
    expect(fake.log).toEqual([]);
  });

  it('몰이 로그인하라고 답하면 signed_out, 본인확인 화면이면 verification_required', async () => {
    const out = harness({ fetch: (url) => body(url, '{"res":false,"msg":"로그인이 필요합니다"}') });
    await expect(checkMallLogin(out.deps, 'domeggook')).resolves.toEqual({ state: 'signed_out', reason: 'login_required_response' });
    const verify = harness({ fetch: () => body('https://partner.kidkids.net/security/verify_user.htm', '<html></html>') });
    await expect(checkMallLogin(verify.deps, 'kidkids')).resolves.toEqual({ state: 'verification_required', reason: 'verification_required' });
  });

  it('401·403은 로그인 필요이고, 따라가지 못한 리다이렉트는 튕겨 나간 것으로 본다', async () => {
    const denied = harness({ fetch: (url) => body(url, '', 401) });
    await expect(checkMallLogin(denied.deps, 'onch')).resolves.toEqual({ state: 'signed_out', reason: 'http_unauthorized' });
    const bounced = harness({
      fetch: (_url, init) => {
        if (init.redirect === 'follow') throw new TypeError('Failed to fetch');
        return new Response(null, { status: 302 });
      },
    });
    await expect(checkMallLogin(bounced.deps, 'teacher-mall')).resolves.toEqual({ state: 'signed_out', reason: 'redirected_away' });
    expect(bounced.fetched.map((call) => call.init.redirect)).toEqual(['follow', 'manual']);
  });

  it('조용히 가리지 못하면 관리자 화면을 확인용 탭에 열어(알림 창 가드) 보고 닫는다', async () => {
    const { deps, fake } = harness({ fetch: (url) => body(url, '<html>무엇인지 모를 화면</html>'), frames: [{ frameId: 0, result: { loginForm: false, verification: false } }] });
    await expect(checkMallLogin(deps, 'onch')).resolves.toEqual({ state: 'signed_in', reason: 'admin_page' });
    expect(fake.log).toEqual([
      'guard dialogs www.onch3.co.kr',
      'open about:blank',
      'navigate https://www.onch3.co.kr/supplier/orders.php?state=all (continue on timeout)',
      `frames ${LOGIN_SCREEN_FILE}`,
      `frames ${LOGIN_SCREEN_FILE}`,
      'close 7',
      'unguard dialogs www.onch3.co.kr',
    ]);
  });

  it('화면에 로그인 폼이 있거나 로그인 주소로 넘어갔으면 signed_out(login_page)', async () => {
    const form = harness({ frames: [{ frameId: 3, result: { loginForm: true, verification: false } }] });
    await expect(checkMallLogin(form.deps, 'coupang')).resolves.toEqual({ state: 'signed_out', reason: 'login_page' });
    const moved = harness({ landAt: 'https://xauth.coupang.com/auth/realms/seller/protocol/openid-connect/auth', frames: [] });
    await expect(checkMallLogin(moved.deps, 'coupang')).resolves.toEqual({ state: 'signed_out', reason: 'login_page' });
  });

  it('인증번호 칸이 있으면 verification_required, 화면을 들여다보지 못하면 signed_out(login_page_not_reachable)', async () => {
    const verify = harness({ frames: [{ frameId: 0, result: { loginForm: false, verification: true } }] });
    await expect(checkMallLogin(verify.deps, 'gs-shop')).resolves.toMatchObject({ state: 'verification_required', reason: 'verification_required' });
    const blind = harness({ frames: null, fetch: (url) => body(url, '<html></html>') });
    await expect(checkMallLogin(blind.deps, 'rocket')).resolves.toEqual({ state: 'signed_out', reason: 'login_page_not_reachable' });
    expect(blind.fake.log).toContain('close 7');
  });

  it('고정 주소 없는 몰은 저장된 사이트 주소를 권한 안에서만 연다 — 없거나 권한 밖이면 탭을 열지 않는다', async () => {
    const saved = harness({ frames: [{ frameId: 0, result: { loginForm: false, verification: false } }] });
    await expect(checkMallLogin(saved.deps, 'unknown-mall', 'https://mall.example.com/admin')).resolves.toEqual({ state: 'signed_in', reason: 'admin_page' });
    expect(saved.fake.log).toContain('navigate https://mall.example.com/admin (continue on timeout)');
    const none = harness();
    await expect(checkMallLogin(none.deps, 'unknown-mall')).resolves.toEqual({ state: 'signed_out', reason: 'no_login_address' });
    const denied = harness({ permitted: false });
    await expect(checkMallLogin(denied.deps, 'unknown-mall', 'https://mall.example.com/admin')).resolves.toEqual({ state: 'signed_out', reason: 'login_page_not_reachable' });
    expect([...none.fake.log, ...denied.fake.log]).toEqual([]);
  });
});
