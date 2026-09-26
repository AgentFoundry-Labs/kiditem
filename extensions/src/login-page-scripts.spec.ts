import { describe, expect, it } from 'vitest';
import dialogsSource from '../kiditem-os/content/page-call/login-dialogs.js?raw';
import fillSource from '../kiditem-os/content/page-call/login-fill.js?raw';

// 사이트 로그인 페이지 파일(KID-377)을 실제 파일 그대로 돌린다. 가짜는 페이지 경계(보이는 입력칸·버튼 DOM, alert)뿐이다.
// 입력칸 모양은 옛 `order-collector-art09-dual-id-login` 테스트의 Cafe24 화면 그대로다.
class FakeInput {
  readonly labels: Array<{ textContent: string }>;
  disabled = false;
  readOnly = false;
  events: string[] = [];
  value = '';
  form: { password: FakeInput } | null = null;
  constructor(readonly id: string, readonly name: string, readonly type = 'text', label = '') {
    this.labels = label ? [{ textContent: label }] : [];
  }
  getAttribute(name: string) {
    return (this as unknown as Record<string, unknown>)[name] ?? null;
  }
  getBoundingClientRect() {
    return { width: 200, height: 40 };
  }
  closest(selector: string) {
    return selector === 'form' ? this.form : null;
  }
  compareDocumentPosition(other: unknown) {
    return other === this.form?.password ? 4 : 0;
  }
  dispatchEvent(event: { type: string }) {
    this.events.push(event.type);
  }
}

function loginButton() {
  return {
    disabled: false,
    textContent: '로그인',
    value: '',
    clicked: false,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 200, height: 40 }),
    click() {
      this.clicked = true;
    },
  };
}

function screen(inputs: FakeInput[]) {
  const button = loginButton();
  const password = inputs.find((input) => input.type === 'password') ?? null;
  const form = password ? { password, querySelectorAll: (selector: string) => (selector === 'input' ? inputs : [button]) } : null;
  for (const input of inputs) input.form = form;
  const document = {
    querySelector: (selector: string) => (selector.includes('#password') ? password : null),
    querySelectorAll: (selector: string) => (selector === 'input' ? inputs : [button]),
  };
  const isolated: Record<string, unknown> = {};
  // 파일의 마지막 식 값(`frames`가 받는 값)을 보려고 eval로 돌린다.
  const probe = new Function('source', 'document', 'window', 'globalThis', 'Event', 'Node', 'KeyboardEvent', 'return eval(source)')(
    fillSource,
    document,
    { getComputedStyle: () => ({ visibility: 'visible', display: 'block' }) },
    isolated,
    class Event { constructor(readonly type: string) {} },
    { DOCUMENT_POSITION_FOLLOWING: 4 },
    class KeyboardEvent { constructor(readonly type: string) {} },
  ) as { loginForm: boolean };
  const fill = (isolated.__kiditemIsolatedPageCalls as Record<string, (args: unknown) => Record<string, unknown>>)['login.fill']!;
  return { probe, fill, button };
}

describe('content/page-call/login-fill.js', () => {
  it('아트공구(Cafe24)는 쇼핑몰 아이디와 공급사 아이디를 따로 채우고 로그인을 누른다', () => {
    const shopId = new FakeInput('mallId', 'mallId', 'text', '아이디');
    const supplierId = new FakeInput('supplierId', 'supplierId', 'text', '공급사 아이디(로그인 아이디)');
    const password = new FakeInput('password', 'password', 'password', '비밀번호');
    const { probe, fill, button } = screen([shopId, supplierId, password]);
    expect(probe).toEqual({ loginForm: true });
    const result = fill({ values: { loginId: 'fake-shop-id', supplierLoginId: 'fake-supplier-id', password: 'fake-password' } });
    expect(result).toEqual({ state: 'submitted', method: 'exact-text' });
    expect([shopId.value, supplierId.value, password.value]).toEqual(['fake-shop-id', 'fake-supplier-id', 'fake-password']);
    expect(button.clicked).toBe(true);
    expect(JSON.stringify(result)).not.toContain('fake-password');
  });

  it('보통 폼은 아이디·비밀번호만 채운다', () => {
    const loginId = new FakeInput('loginId', 'loginId', 'text', '아이디');
    const password = new FakeInput('password', 'password', 'password', '비밀번호');
    const { fill } = screen([loginId, password]);
    expect(fill({ values: { loginId: 'fake-id', password: 'fake-password' } })).toMatchObject({ state: 'submitted' });
    expect([loginId.value, password.value]).toEqual(['fake-id', 'fake-password']);
    expect(loginId.events).toEqual(['input', 'change']);
  });

  it('비밀번호 칸이 없으면 폼 없음, 값이 없으면 채우지 않는다, 아이디 칸이 없으면 덜 그려진 폼이다', () => {
    const empty = screen([new FakeInput('q', 'q', 'text', '검색')]);
    expect(empty.probe).toEqual({ loginForm: false });
    expect(empty.fill({ values: { loginId: 'fake-id', password: 'fake-password' } })).toEqual({ state: 'no-login-form' });

    const password = new FakeInput('password', 'password', 'password', '비밀번호');
    const passwordOnly = screen([password]);
    expect(passwordOnly.probe).toEqual({ loginForm: false });
    expect(passwordOnly.fill({ values: null })).toEqual({ state: 'credentials-missing' });
    expect(passwordOnly.fill({ values: { loginId: 'fake-id', password: 'fake-password' } })).toEqual({ state: 'incomplete', reason: 'id-input-not-found' });
    expect(password.value).toBe('');
  });
});

describe('content/page-call/login-dialogs.js', () => {
  it('지켜보는 동안 alert 문장을 모았다가 돌려주고 원래 alert으로 되돌린다', () => {
    const shown: string[] = [];
    const nativeAlert = (message: string) => shown.push(message);
    const window: Record<string, unknown> = { alert: nativeAlert };
    new Function('window', dialogsSource)(window);
    const calls = window.__kiditemPageCalls as Record<string, () => unknown>;
    expect(calls['login.watchDialogs']!()).toBe(true);
    (window.alert as (message: string) => void)('아이디 또는 비밀번호가 일치하지 않습니다.');
    expect(shown).toEqual([]);
    expect(calls['login.takeDialogs']!()).toEqual(['아이디 또는 비밀번호가 일치하지 않습니다.']);
    expect(window.alert).toBe(nativeAlert);
    expect(calls['login.takeDialogs']!()).toEqual([]);
  });
});
