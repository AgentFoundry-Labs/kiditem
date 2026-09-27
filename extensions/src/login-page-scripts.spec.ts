import { describe, expect, it } from 'vitest';
import bridgeSource from '../kiditem-os/content/page-call/dialog-guard-bridge.js?raw';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
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
  // 컨트롤 셀렉터에만 버튼을 준다(캡차 위젯 셀렉터 같은 다른 물음에는 없다).
  const pick = (selector: string) => (selector === 'input' ? inputs : /button|\ba\b|role|onclick|submit/.test(selector) ? [button] : []);
  const form = password ? { password, querySelectorAll: pick } : null;
  for (const input of inputs) input.form = form;
  const document = {
    querySelector: (selector: string) => (selector.includes('#password') ? password : null),
    querySelectorAll: pick,
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

/** 가드를 넣은 창 하나(MAIN). `runTab()`은 ISOLATED 짝이 보내는 표시를 흉내 낸다. */
function guardedWindow(native: { alert?: (message: string) => unknown; confirm?: (message: string) => boolean } = {}) {
  const listeners: Array<(event: { source: unknown; origin: string; data: unknown }) => void> = [];
  const window: Record<string, unknown> = {
    alert: native.alert ?? (() => undefined),
    confirm: native.confirm ?? (() => false),
    location: { origin: 'https://mall.test' },
    addEventListener: (type: string, listener: (event: { source: unknown; origin: string; data: unknown }) => void) => {
      if (type === 'message') listeners.push(listener);
    },
  };
  new Function('window', guardSource)(window);
  return {
    window,
    alert: (message: string) => (window.alert as (message: string) => unknown)(message),
    confirm: (message: string) => (window.confirm as (message: string) => boolean)(message),
    post: (data: unknown, source: unknown = window, origin = 'https://mall.test') => listeners.forEach((listener) => listener({ source, origin, data })),
  };
}

describe('content/page-call/dialog-guard.js — 불러오는 중 뜨는 알림 창(KID-380 D4, 실기기 R1)', () => {
  it('alert는 탭이 무엇이든(보이는 탭이라도) 문장만 모으고 바로 돌아간다 — 로드가 멈추지 않는다, 두 번 들어와도 한 번만 바꾼다', () => {
    const shown: string[] = [];
    const page = guardedWindow({ alert: (message) => shown.push(message) });
    new Function('window', guardSource)(page.window);
    expect(page.alert('로그인이 만료되었습니다.')).toBeUndefined();
    expect(shown).toEqual([]);
    expect(page.window.__kiditemDialogs).toEqual(['로그인이 만료되었습니다.']);
  });

  it('confirm은 수집 탭 표시가 오기 전까지 진짜 창으로 넘기고, 표시가 오면 문장을 모으고 확인한다', () => {
    const shown: string[] = [];
    const page = guardedWindow({ confirm: (message) => { shown.push(message); return false; } });
    expect(page.confirm('삭제할까요?')).toBe(false);
    expect(shown).toEqual(['삭제할까요?']);
    // 다른 창·다른 출처의 표시는 받지 않는다.
    page.post({ kiditemDialogGuard: 'run-tab' }, {});
    page.post({ kiditemDialogGuard: 'run-tab' }, page.window, 'https://evil.test');
    expect(page.confirm('아직 운영자 탭')).toBe(false);
    page.post({ kiditemDialogGuard: 'run-tab' });
    expect(page.confirm('Session이 종료되었거나 다른 곳에서 로그인했습니다.')).toBe(true);
    expect(shown).toEqual(['삭제할까요?', '아직 운영자 탭']);
    expect(page.window.__kiditemDialogs).toEqual(['Session이 종료되었거나 다른 곳에서 로그인했습니다.']);
  });

  it('로그인 알림 창 받기는 지켜보기 전 문장을 버리고, 누른 뒤 가드에 모인 문장을 몰의 말로 돌려준다', () => {
    const page = guardedWindow();
    new Function('window', dialogsSource)(page.window);
    const calls = page.window.__kiditemPageCalls as Record<string, () => unknown>;
    page.alert('로그인이 만료되었습니다.');
    expect(calls['login.watchDialogs']!()).toBe(true);
    page.alert('아이디 또는 비밀번호가 일치하지 않습니다.');
    expect(calls['login.takeDialogs']!()).toEqual(['아이디 또는 비밀번호가 일치하지 않습니다.']);
    expect(calls['login.takeDialogs']!()).toEqual([]);
    page.alert('다시');
    expect(page.window.__kiditemDialogs).toEqual(['다시']);
  });
});

describe('content/page-call/dialog-guard.js — 운영자 탭이면 진짜 창으로(리뷰 2 SHOULD 2·3)', () => {
  it('짝이 "운영자 탭"이라 알리면 alert·confirm 모두 진짜 창이고, 수집 탭 표시가 다시 오면 기록·확인으로 돌아간다', () => {
    const shown: string[] = [];
    const page = guardedWindow({ alert: (message) => { shown.push(`alert ${message}`); }, confirm: (message) => { shown.push(`confirm ${message}`); return false; } });
    page.post({ kiditemDialogGuard: 'run-tab' });
    expect(page.confirm('자동')).toBe(true);
    // 운영자에게 넘긴 탭(GS샵 SMS 인증·남긴 로그인 탭).
    page.post({ kiditemDialogGuard: 'operator-tab' });
    page.alert('인증번호가 발송되었습니다.');
    expect(page.confirm('다시 받을까요?')).toBe(false);
    expect(shown).toEqual(['alert 인증번호가 발송되었습니다.', 'confirm 다시 받을까요?']);
    expect(page.window.__kiditemDialogs).toEqual(['자동']);
    page.post({ kiditemDialogGuard: 'run-tab' });
    page.alert('로드 중 알림');
    expect(shown).toHaveLength(2);
  });
});

describe('content/page-call/dialog-guard.js — 몰 쓰기 탭은 confirm을 거절한다(KID-256)', () => {
  it('"쓰기 탭" 표시가 오면 alert·confirm 문장을 모으고 confirm은 거절한다 — 채우는 동안 몰이 묻는 저장·이동을 받지 않는다', () => {
    const shown: string[] = [];
    const page = guardedWindow({ confirm: (message) => { shown.push(message); return true; } });
    // 채우는 처리기는 같은 문서에서 곧바로(동기) 쓰기 탭으로 돌린다 — postMessage는 늦게 닿아 그 사이 confirm이 확인될 수 있다.
    (page.window.__kiditemWriteTab as () => void)();
    expect(page.confirm('임시저장 하시겠습니까?')).toBe(false);
    page.alert('필수 항목을 입력하세요.');
    expect(shown).toEqual([]);
    expect(page.window.__kiditemDialogs).toEqual(['임시저장 하시겠습니까?', '필수 항목을 입력하세요.']);
  });

  it('쓰기 처리기는 몰 말을 나오는 즉시 듣는다(sink) — 모은 문장 상한(20)과 상관없이, 떼면 더 듣지 않는다', () => {
    const page = guardedWindow();
    (page.window.__kiditemWriteTab as () => void)();
    const heard: string[] = [];
    const release = (page.window.__kiditemDialogSink as (sink: (message: string) => void) => () => void)((message) => heard.push(message));
    for (let i = 0; i < 25; i += 1) page.alert(`안내 ${i}`);
    expect(page.confirm('저장할까요?')).toBe(false);
    release();
    page.alert('뗀 뒤');
    expect(heard).toHaveLength(26);
    expect(heard.at(-1)).toBe('저장할까요?');
    expect(page.window.__kiditemDialogs).toHaveLength(20);
  });

  it('수집 탭 표시가 뒤늦게 와도 쓰기 탭은 그대로이고, 운영자에게 넘기면(operator-tab) 진짜 창으로 돌아간다', () => {
    const shown: string[] = [];
    const page = guardedWindow({ confirm: (message) => { shown.push(message); return true; } });
    page.post({ kiditemDialogGuard: 'write-tab' });
    page.post({ kiditemDialogGuard: 'run-tab' });
    expect(page.confirm('저장할까요?')).toBe(false);
    page.post({ kiditemDialogGuard: 'operator-tab' });
    expect(page.confirm('사람이 누른 저장')).toBe(true);
    expect(shown).toEqual(['사람이 누른 저장']);
  });
});

describe('content/page-call/dialog-guard.js — 화면이 넘어가도 몰의 말을 잃지 않는다(실기기 R5)', () => {
  it('모은 문장을 그 출처의 sessionStorage에 두고, 다음 문서의 가드가 이어받아 로그인 알림 창 받기가 돌려준다', () => {
    const store = new Map<string, string>();
    const sessionStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    };
    const make = () => {
      const window: Record<string, unknown> = { alert: () => undefined, confirm: () => false, location: { origin: 'https://po.i-screammall.co.kr' }, addEventListener: () => undefined, sessionStorage };
      new Function('window', guardSource)(window);
      new Function('window', dialogsSource)(window);
      return window;
    };
    const loginPage = make();
    (loginPage.__kiditemPageCalls as Record<string, () => unknown>)['login.watchDialogs']!();
    (loginPage.alert as (message: string) => void)('아이디 혹은 비밀번호가 일치하지 않습니다.');
    // 몰이 /error/loginExpired로 넘긴다 — 새 문서.
    const errorPage = make();
    expect((errorPage.__kiditemPageCalls as Record<string, () => unknown>)['login.takeDialogs']!()).toEqual(['아이디 혹은 비밀번호가 일치하지 않습니다.']);
    expect(make().__kiditemDialogs).toEqual([]);
  });
});

describe('content/page-call/dialog-guard-bridge.js — 수집 탭인지 런타임에 묻는다(ISOLATED, 실기기 R1)', () => {
  function bridge(answer: unknown, lastError: unknown = undefined) {
    const sent: unknown[] = [];
    const posted: Array<[unknown, string]> = [];
    let onMessage: ((message: unknown, sender: unknown, sendResponse: (answer: unknown) => void) => unknown) | null = null;
    const chrome = {
      runtime: {
        get lastError() { return lastError; },
        sendMessage: (message: unknown, callback: (response: unknown) => void) => { sent.push(message); callback(answer); },
        onMessage: { addListener: (listener: typeof onMessage) => { onMessage = listener; } },
      },
    };
    const window = { postMessage: (data: unknown, origin: string) => posted.push([data, origin]) };
    new Function('chrome', 'window', 'location', bridgeSource)(chrome, window, { origin: 'https://mall.test' });
    return { sent, posted, receive: (message: unknown) => onMessage?.(message, {}, () => undefined) };
  }

  it('런타임이 수집 탭이라 답하면 같은 출처로 MAIN 가드에 표시를 보낸다', () => {
    const run = bridge({ runTab: true });
    expect(run.sent).toEqual([{ action: 'kiditem.dialogGuard.isRunTab' }]);
    expect(run.posted).toEqual([[{ kiditemDialogGuard: 'run-tab' }, 'https://mall.test']]);
  });

  it('운영자 탭이라 답하면 운영자 탭 표시를, 답이 없으면 아무것도 보내지 않는다(리뷰 2 SHOULD 2)', () => {
    expect(bridge({ runTab: false }).posted).toEqual([[{ kiditemDialogGuard: 'operator-tab' }, 'https://mall.test']]);
    expect(bridge(undefined, { message: 'Receiving end does not exist.' }).posted).toEqual([]);
  });

  it('자기 메시지가 아닌 것(페이지 호출 KIDITEM_PAGE_CALL 등)에는 false로 답하지 않고 넘긴다(재QA 2 B1)', () => {
    const run = bridge({ runTab: true });
    expect(run.receive({ type: 'KIDITEM_PAGE_CALL', call: 'login.fill', args: {} })).toBe(false);
    expect(run.receive({ action: 'other' })).toBe(false);
    expect(run.receive({ action: 'kiditem.dialogGuard.setRunTab', runTab: false })).toBe(false);
  });

  it('런타임이 탭을 운영자에게 넘기거나(runTab false) 다시 쓰면(true) 그 표시를 MAIN에 보낸다(리뷰 2 SHOULD 2·3)', () => {
    const run = bridge({ runTab: true });
    run.receive({ action: 'kiditem.dialogGuard.setRunTab', runTab: false });
    run.receive({ action: 'kiditem.dialogGuard.setRunTab', runTab: true });
    run.receive({ action: 'other' });
    expect(run.posted.map(([data]) => data)).toEqual([
      { kiditemDialogGuard: 'run-tab' },
      { kiditemDialogGuard: 'operator-tab' },
      { kiditemDialogGuard: 'run-tab' },
    ]);
  });
});
